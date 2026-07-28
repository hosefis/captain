import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  formatSmokeFailure,
  resolveSmokeCommand,
  resolveSmokeSteps,
  runSmokeValidation,
  smokeFixHint,
  type SmokeRunner,
} from "./smoke.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";

const tierAWebConfig: NormalizedProjectConfig = {
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
  const dir = join(tmpdir(), `captain-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeRootPackageJson(
  directory: string,
  scripts: Record<string, string>,
): void {
  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify({ name: "test-workspace", private: true, scripts }, null, 2)}\n`,
    "utf-8",
  );
}

describe("resolveSmokeSteps", () => {
  it("includes build for agent mode", () => {
    expect(resolveSmokeSteps(tierAWebConfig, true)).toEqual(["typecheck", "lint", "build"]);
  });

  it("omits build for human mode", () => {
    expect(resolveSmokeSteps(tierAWebConfig, false)).toEqual(["typecheck", "lint"]);
  });
});

describe("resolveSmokeCommand", () => {
  it("uses pnpm run by default", () => {
    expect(resolveSmokeCommand("typecheck", "pnpm")).toEqual({
      command: "pnpm",
      args: ["run", "typecheck"],
    });
  });

  it("uses npm run for npm projects", () => {
    expect(resolveSmokeCommand("lint", "npm")).toEqual({
      command: "npm",
      args: ["run", "lint"],
    });
  });
});

describe("runSmokeValidation", () => {
  it("runs steps in order with injected runner", async () => {
    const directory = makeTempDir();
    writeRootPackageJson(directory, {
      typecheck: "tsc --noEmit",
      lint: "eslint .",
    });

    const seen: string[] = [];
    const runner: SmokeRunner = async (step) => {
      seen.push(step);
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const result = await runSmokeValidation(directory, ["typecheck", "lint"], { runner });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.completedSteps).toEqual(["typecheck", "lint"]);
    }
    expect(seen).toEqual(["typecheck", "lint"]);
  });

  it("returns fix hint when a step fails", async () => {
    const directory = makeTempDir();
    writeRootPackageJson(directory, {
      typecheck: "tsc --noEmit",
      lint: "eslint .",
    });

    const runner: SmokeRunner = async (step) => ({
      exitCode: step === "typecheck" ? 1 : 0,
      stdout: "",
      stderr: "TS2322: type mismatch",
    });

    const result = await runSmokeValidation(directory, ["typecheck", "lint"], { runner });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe("typecheck");
      expect(result.fixHint).toBe(smokeFixHint("typecheck"));
      expect(formatSmokeFailure(result)).toContain("TS2322");
      expect(formatSmokeFailure(result)).toContain("typecheck");
    }
  });

  it("fails when a required script is missing", async () => {
    const directory = makeTempDir();
    writeRootPackageJson(directory, { typecheck: "tsc --noEmit" });

    const result = await runSmokeValidation(directory, ["typecheck", "build"], {
      runner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStep).toBe("build");
      expect(result.stderr).toContain('Missing "build" script');
    }
  });
});
