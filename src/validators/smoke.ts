import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import { resolveSmokePlan } from "../resolver/recipe-plan.js";
import type { NormalizedProjectConfig, PackageManager } from "../schema/project-config.js";

export type SmokeStep = "typecheck" | "lint" | "build";

export type SmokeRunner = (
  step: SmokeStep,
  command: string,
  args: string[],
  cwd: string,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export type SmokeRunResult =
  | { ok: true; steps: SmokeStep[]; completedSteps: SmokeStep[] }
  | {
      ok: false;
      failedStep: SmokeStep;
      exitCode: number;
      stderr: string;
      fixHint: string;
      completedSteps: SmokeStep[];
    };

const FIX_HINTS: Record<SmokeStep, string> = {
  typecheck:
    "Fix TypeScript errors in the reported files, then re-run the workspace typecheck script.",
  lint: "Fix ESLint issues in the reported files, or run the lint script with --fix if supported.",
  build:
    "Fix build errors in the app or workspace packages, then re-run the workspace build script.",
};

export function smokeFixHint(step: SmokeStep): string {
  return FIX_HINTS[step];
}

export function resolveSmokeSteps(
  config: NormalizedProjectConfig,
  agentMode: boolean,
): SmokeStep[] {
  return resolveSmokePlan(config, agentMode) as SmokeStep[];
}

export function resolveSmokeCommand(
  step: SmokeStep,
  packageManager: PackageManager,
): { command: string; args: string[] } {
  if (packageManager === "npm") {
    return { command: "npm", args: ["run", step] };
  }
  if (packageManager === "bun") {
    return { command: "bun", args: ["run", step] };
  }
  return { command: "pnpm", args: ["run", step] };
}

function readRootScripts(directory: string): Record<string, string> | null {
  const pkgPath = join(directory, "package.json");
  if (!existsSync(pkgPath)) {
    return null;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
    scripts?: Record<string, string>;
  };
  return pkg.scripts ?? null;
}

async function defaultSmokeRunner(
  _step: SmokeStep,
  command: string,
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = execa(command, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    reject: false,
  });

  const [stdout, stderr] = await Promise.all([
    child.stdout ?? Promise.resolve(""),
    child.stderr ?? Promise.resolve(""),
  ]);

  const result = await child;
  return {
    exitCode: result.exitCode ?? 1,
    stdout: String(stdout),
    stderr: String(stderr),
  };
}

export async function runSmokeValidation(
  directory: string,
  steps: SmokeStep[],
  options: {
    packageManager?: PackageManager;
    runner?: SmokeRunner;
  } = {},
): Promise<SmokeRunResult> {
  const packageManager = options.packageManager ?? "pnpm";
  const runner = options.runner ?? defaultSmokeRunner;
  const scripts = readRootScripts(directory);
  const completedSteps: SmokeStep[] = [];

  for (const step of steps) {
    if (scripts && !(step in scripts)) {
      return {
        ok: false,
        failedStep: step,
        exitCode: 1,
        stderr: `Missing "${step}" script in ${join(directory, "package.json")}`,
        fixHint: `Add a "${step}" script to the workspace root package.json.`,
        completedSteps,
      };
    }

    const { command, args } = resolveSmokeCommand(step, packageManager);
    const result = await runner(step, command, args, directory);

    if (result.exitCode !== 0) {
      return {
        ok: false,
        failedStep: step,
        exitCode: result.exitCode,
        stderr: result.stderr || result.stdout || `${step} failed`,
        fixHint: smokeFixHint(step),
        completedSteps,
      };
    }

    completedSteps.push(step);
  }

  return { ok: true, steps, completedSteps };
}

export function formatSmokeFailure(
  result: Extract<SmokeRunResult, { ok: false }>,
): string {
  const lines = [
    `Smoke validation failed at step: ${result.failedStep} (exit ${result.exitCode})`,
    "",
    result.stderr.trim(),
    "",
    `Fix: ${result.fixHint}`,
  ];

  if (result.completedSteps.length > 0) {
    lines.push("", `Completed: ${result.completedSteps.join(" → ")}`);
  }

  return lines.join("\n");
}
