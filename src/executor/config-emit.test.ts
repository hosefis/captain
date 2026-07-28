import { mkdirSync, readFileSync } from "node:fs";
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
  auth: "clerk",
  i18n: { web: "gt-next" },
  ui: { web: "shadcn-base-ui" },
  modules: ["authorization"],
  locales: ["en", "fr"],
  defaultLocale: "en",
  validation: "strict",
  stacks: { hasWeb: true, hasMobile: false, hasDesktop: false },
};

describe("applyConfigEmit", () => {
  it("writes CONTEXT.md, .env.example, and project.json", () => {
    const targetDir = join(tmpdir(), `captain-config-${Date.now()}`);
    mkdirSync(targetDir, { recursive: true });

    applyConfigEmit(config, targetDir);

    const context = readFileSync(join(targetDir, "CONTEXT.md"), "utf-8");
    expect(context).toContain("acme-web");
    expect(context).toContain("@acme");

    const envExample = readFileSync(join(targetDir, ".env.example"), "utf-8");
    expect(envExample).toContain("DEFAULT_LOCALE=en");

    const projectJson = JSON.parse(readFileSync(join(targetDir, "project.json"), "utf-8")) as {
      name: string;
      scope: string;
    };
    expect(projectJson.name).toBe("acme-web");
    expect(projectJson.scope).toBe("@acme");
    expect("stacks" in projectJson).toBe(false);
  });
});
