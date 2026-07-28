import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseCatalogFields, scaffoldCatalogResource } from "./scaffold-catalog.js";
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
  modules: ["authorization", "admin-catalog"],
  locales: ["en", "fr"],
  defaultLocale: "en",
  validation: "strict",
  stacks: { hasWeb: true, hasMobile: false, hasDesktop: false },
};

function makeTempDir(): string {
  const dir = join(tmpdir(), `captain-scaffold-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("parseCatalogFields", () => {
  it("parses comma-separated field definitions", () => {
    const fields = parseCatalogFields("name:string,description:string,active:boolean");
    expect(fields).toEqual([
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "active", type: "boolean" },
    ]);
  });

  it("returns null for invalid input", () => {
    expect(parseCatalogFields(undefined)).toBeNull();
    expect(parseCatalogFields("name")).toBeNull();
    expect(parseCatalogFields("name:invalid")).toBeNull();
  });
});

describe("scaffoldCatalogResource", () => {
  it("emits resource config, admin page, api route, and i18n stubs", () => {
    const targetDir = makeTempDir();
    mkdirSync(join(targetDir, "packages", "core", "src"), { recursive: true });
    mkdirSync(join(targetDir, "apps", "web"), { recursive: true });

    const result = scaffoldCatalogResource({
      resourceSlug: "billing-types",
      fields: [
        { name: "name", type: "string" },
        { name: "description", type: "string" },
      ],
      archive: true,
      targetDir,
      config: webConfig,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const resourceConfig = readFileSync(
      join(targetDir, "packages", "core", "src", "admin-catalog", "resources", "billing-types.ts"),
      "utf-8",
    );
    expect(resourceConfig).toContain("BillingTypesCatalogConfig");
    expect(resourceConfig).toContain('apiPath: "/api/admin/billing-types"');
    expect(resourceConfig).toContain("archive: true");

    expect(
      existsSync(join(targetDir, "apps", "web", "app", "admin", "billing-types", "page.tsx")),
    ).toBe(true);
    expect(
      existsSync(join(targetDir, "apps", "web", "app", "api", "admin", "billing-types", "route.ts")),
    ).toBe(true);
    expect(existsSync(join(targetDir, "apps", "web", "locales", "en", "billing-types.json"))).toBe(
      true,
    );
    expect(existsSync(join(targetDir, "apps", "web", "locales", "fr", "billing-types.json"))).toBe(
      true,
    );
  });

  it("requires admin-catalog module in project config", () => {
    const targetDir = makeTempDir();
    const result = scaffoldCatalogResource({
      resourceSlug: "items",
      fields: [{ name: "name", type: "string" }],
      archive: false,
      targetDir,
      config: { ...webConfig, modules: ["authorization"] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toContain("admin-catalog");
  });
});
