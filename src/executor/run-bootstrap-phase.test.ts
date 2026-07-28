import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runBootstrapPhase } from "./run-bootstrap-phase.js";
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
  locales: ["en", "fr"],
  defaultLocale: "en",
  validation: "strict",
  stacks: { hasWeb: true, hasMobile: false, hasDesktop: false },
};

function makeTempDir(): string {
  const dir = join(tmpdir(), `captain-phase-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("runBootstrapPhase", () => {
  it("completes end-to-end with mocked bootstrap runner", async () => {
    const targetDir = makeTempDir();

    const result = await runBootstrapPhase(webConfig, targetDir, {
      bootstrapRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      simulateBootstrapOutput: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.completedBootstrapSteps).toEqual([
      "bootstrap-web",
      "install-root",
    ]);
    expect(result.appliedRecipes).toContain("workspace-promote");
    expect(result.appliedRecipes).toContain("backend-rest");
    expect(result.appliedRecipes).toContain("module-authorization");
    expect(result.appliedRecipes).toContain("auth-clerk");
    expect(existsSync(join(targetDir, "packages", "core", "src", "backend", "client.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "packages", "core", "src", "authorization", "types.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "CONTEXT.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".env.example"))).toBe(true);
    expect(existsSync(join(targetDir, "project.json"))).toBe(true);
    expect(readFileSync(join(targetDir, "apps/web/package.json"), "utf-8")).toContain("@acme/web");
  });

  it("returns bootstrap failure from runner", async () => {
    const targetDir = makeTempDir();

    const result = await runBootstrapPhase(webConfig, targetDir, {
      bootstrapRunner: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "network error",
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.phase).toBe("bootstrap");
    expect(result.message).toContain("bootstrap-web");
  });
});
