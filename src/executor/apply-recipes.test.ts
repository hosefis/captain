import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { applyRecipes } from "./apply-recipes.js";
import { applyWorkspacePromotion } from "./workspace-promote.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";

const webConfig: NormalizedProjectConfig = {
  name: "acme-web",
  scope: "@acme",
  packageManager: "pnpm",
  topology: "web",
  apps: ["web"],
  backend: "rest",
  auth: "clerk",
  i18n: { web: "gt-next" },
  ui: { web: "shadcn-base-ui" },
  modules: ["authorization"],
  payment: {
    enabled: false,
    processors: [],
    orchestration: "backend-mediated",
    primary: null,
  },
  locales: ["en", "fr"],
  defaultLocale: "en",
  validation: "strict",
  stacks: { hasWeb: true, hasMobile: false, hasDesktop: false },
};

function makeTempDir(): string {
  const dir = join(tmpdir(), `captain-recipes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function seedWebWorkspace(targetDir: string): void {
  mkdirSync(join(targetDir, "apps", "web"), { recursive: true });
  writeFileSync(
    join(targetDir, "apps", "web", "package.json"),
    JSON.stringify({ name: "temp-next", scripts: { dev: "next dev" } }, null, 2),
  );
  writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "acme-web", private: true }, null, 2));
}

describe("applyRecipes", () => {
  it("emits Tier A web modules and adapters", () => {
    const targetDir = makeTempDir();
    seedWebWorkspace(targetDir);
    applyWorkspacePromotion(webConfig, targetDir);

    const result = applyRecipes(webConfig, targetDir);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.appliedRecipes).toEqual([
      "backend-rest",
      "module-authorization",
      "auth-clerk",
      "i18n-web-gt-next",
      "i18n-enforcement",
      "ui-web-shadcn-base-ui",
    ]);

    const coreIndex = readFileSync(join(targetDir, "packages", "core", "src", "index.ts"), "utf-8");
    expect(coreIndex).toContain("createHttpClient");
    expect(coreIndex).toContain("authorize");
    expect(coreIndex).toContain("createInMemoryAuthorizationAdapter");

    const adapterIndex = readFileSync(
      join(targetDir, "packages", "adapters-next", "src", "index.ts"),
      "utf-8",
    );
    expect(adapterIndex).toContain("createRestBackendClient");
    expect(adapterIndex).toContain("clerkAuthConfig");
    expect(adapterIndex).toContain("gtNextConfig");
    expect(adapterIndex).toContain("shadcnBaseUiConfig");

    expect(existsSync(join(targetDir, "tools", "i18n", "i18n-check.mjs"))).toBe(true);

    const rootPkg = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };
    expect(rootPkg.scripts["i18n:check"]).toContain("tools/i18n/i18n-check.mjs");
  });

  it("emits Tier A mobile modules and adapters", () => {
    const mobileConfig: NormalizedProjectConfig = {
      ...webConfig,
      name: "acme-mobile",
      topology: "mobile",
      apps: ["mobile"],
      i18n: { mobile: "gt-react-native" },
      ui: { mobile: "nativewind" },
      runtime: "dev-build",
      stacks: { hasWeb: false, hasMobile: true, hasDesktop: false },
    };

    const targetDir = makeTempDir();
    mkdirSync(join(targetDir, "apps", "mobile"), { recursive: true });
    writeFileSync(
      join(targetDir, "apps", "mobile", "package.json"),
      JSON.stringify({ name: "temp-expo", scripts: { start: "expo start" } }, null, 2),
    );
    writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "acme-mobile", private: true }, null, 2));
    applyWorkspacePromotion(mobileConfig, targetDir);

    const result = applyRecipes(mobileConfig, targetDir);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.appliedRecipes).toContain("i18n-mobile-gt-react-native");
    expect(result.appliedRecipes).toContain("expo-localization");
    expect(result.appliedRecipes).toContain("ui-mobile-nativewind");

    const adapterIndex = readFileSync(
      join(targetDir, "packages", "adapters-expo", "src", "index.ts"),
      "utf-8",
    );
    expect(adapterIndex).toContain("gtReactNativeConfig");
    expect(adapterIndex).toContain("nativeWindConfig");
  });

  it("emits payment module and custom-api adapter", () => {
    const targetDir = makeTempDir();
    seedWebWorkspace(targetDir);
    applyWorkspacePromotion(webConfig, targetDir);

    const paymentConfig: NormalizedProjectConfig = {
      ...webConfig,
      modules: ["authorization", "payment"],
      payment: {
        enabled: true,
        processors: ["custom-api"],
        orchestration: "backend-mediated",
        primary: "custom-api",
      },
    };

    const result = applyRecipes(paymentConfig, targetDir);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.appliedRecipes).toContain("module-payment");
    expect(result.appliedRecipes).toContain("payment-custom-api");

    const coreIndex = readFileSync(join(targetDir, "packages", "core", "src", "index.ts"), "utf-8");
    expect(coreIndex).toContain("initiateCheckout");
    expect(coreIndex).toContain("PendingPaymentScreen");

    expect(
      existsSync(join(targetDir, "packages", "core", "src", "payment", "checkout.ts")),
    ).toBe(true);
    expect(
      existsSync(
        join(targetDir, "packages", "adapters-next", "src", "payment", "custom-api.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(join(targetDir, "apps", "web", "app", "api", "webhooks", "payment", "route.ts")),
    ).toBe(true);
    expect(existsSync(join(targetDir, "apps", "web", "locales", "en", "payment.json"))).toBe(true);
  });

  it("emits admin-catalog module on init", () => {
    const targetDir = makeTempDir();
    seedWebWorkspace(targetDir);
    applyWorkspacePromotion(webConfig, targetDir);

    const catalogConfig: NormalizedProjectConfig = {
      ...webConfig,
      modules: ["authorization", "admin-catalog"],
    };

    const result = applyRecipes(catalogConfig, targetDir);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.appliedRecipes).toContain("module-admin-catalog");

    const coreIndex = readFileSync(join(targetDir, "packages", "core", "src", "index.ts"), "utf-8");
    expect(coreIndex).toContain("createAdminCatalogDriver");

    expect(
      existsSync(join(targetDir, "packages", "core", "src", "admin-catalog", "driver.ts")),
    ).toBe(true);
  });
});
