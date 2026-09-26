import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { applyConfigEmit } from "./config-emit.js";
import {
  loadProjectConfigFromFile,
  type NormalizedProjectConfig,
} from "../schema/project-config.js";

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
    expect("apps" in projectJson).toBe(false);
    expect(loadProjectConfigFromFile(join(targetDir, "project.json")).apps).toEqual([
      "web",
    ]);
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
