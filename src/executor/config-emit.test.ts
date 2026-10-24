import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { applyConfigEmit } from "./config-emit.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";

const config: NormalizedProjectConfig = {
  name: "acme-web",
  scope: "@acme",
  packageManager: "pnpm",
  topology: "web",
  apps: ["web"],
  backend: "rest",
  convexExample: false,
  auth: "clerk",
  i18n: { web: "gt-next" },
  ui: { web: "shadcn-base-ui" },
  locales: ["en", "fr"],
  defaultLocale: "en",
  stacks: { hasWeb: true, hasMobile: false },
};

describe("applyConfigEmit", () => {
  it("writes project documentation and environment examples without scaffold configuration", () => {
    const targetDir = join(tmpdir(), `captain-config-${Date.now()}`);
    mkdirSync(targetDir, { recursive: true });

    applyConfigEmit(config, targetDir);

    const context = readFileSync(join(targetDir, "CONTEXT.md"), "utf-8");
    expect(context).toContain("acme-web");
    expect(context).toContain("@acme");
    expect(context).not.toMatch(/captain|project\.json|compatibility\.json/i);

    const envExample = readFileSync(join(targetDir, ".env.example"), "utf-8");
    expect(envExample).toContain("DEFAULT_LOCALE=en");
    expect(envExample).not.toMatch(/captain/i);

    expect(existsSync(join(targetDir, "project.json"))).toBe(false);
  });

  it("preserves an existing project.json owned by the user", () => {
    const targetDir = join(tmpdir(), `captain-config-existing-${Date.now()}`);
    mkdirSync(targetDir, { recursive: true });
    const contents = '{"customSetting":true}\n';
    writeFileSync(join(targetDir, "project.json"), contents);

    applyConfigEmit(config, targetDir);

    expect(readFileSync(join(targetDir, "project.json"), "utf-8")).toBe(contents);
  });

  it("emits only Convex backend variables for a Convex project", () => {
    const targetDir = join(tmpdir(), `captain-config-convex-${Date.now()}`);
    mkdirSync(targetDir, { recursive: true });

    applyConfigEmit({ ...config, backend: "convex", convexExample: true }, targetDir);

    const envExample = readFileSync(join(targetDir, ".env.example"), "utf-8");
    expect(envExample).toContain("NEXT_PUBLIC_CONVEX_URL=");
    expect(envExample).not.toContain("API_BASE_URL");
    expect(readFileSync(join(targetDir, "CONTEXT.md"), "utf-8")).toContain(
      "Convex example | enabled",
    );
  });
});
