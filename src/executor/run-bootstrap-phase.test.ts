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
  locales: ["en", "fr"],
  defaultLocale: "en",
  stacks: { hasWeb: true, hasMobile: false },
};

function makeTempDir(): string {
  const dir = join(tmpdir(), `captain-phase-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("runBootstrapPhase", () => {
  it("completes end-to-end with mocked bootstrap runner", async () => {
    const targetDir = makeTempDir();
    const progress: string[] = [];

    const result = await runBootstrapPhase(webConfig, targetDir, {
      bootstrapRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      simulateBootstrapOutput: true,
      onProgress: (event) => progress.push(`${event.status}:${event.id}`),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.completedBootstrapSteps).toEqual([
      "bootstrap-web",
      "install-root",
    ]);
    expect(result.appliedRecipes).toContain("project-structure");
    expect(result.appliedRecipes).toContain("backend-rest");
    expect(result.appliedRecipes).toContain("module-authorization");
    expect(result.appliedRecipes).toContain("auth-clerk");
    expect(existsSync(join(targetDir, "src", "lib", "backend", "client.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "src", "features", "authorization", "types.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "CONTEXT.md"))).toBe(true);
    expect(existsSync(join(targetDir, ".env.example"))).toBe(true);
    expect(existsSync(join(targetDir, "project.json"))).toBe(true);
    expect(readFileSync(join(targetDir, "package.json"), "utf-8")).toContain('"name": "acme-web"');
    expect(existsSync(join(targetDir, "src/lib/backend/client.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "turbo.json"))).toBe(false);
    expect(progress).toContain("start:bootstrap-web");
    expect(progress).toContain("complete:bootstrap-web");
    expect(progress).toContain("start:backend-rest");
    expect(progress).toContain("complete:install-root");
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
