import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import { resolveSmokePlan } from "../resolver/recipe-plan.js";
import type { NormalizedProjectConfig, PackageManager } from "../schema/project-config.js";
import { resolvePackageManagerDriver } from "../executor/package-manager.js";

export type SmokeStep = "typecheck" | "lint" | "build";

/** Execute a project validation command and capture its process result. */
export type SmokeRunner = (
  step: SmokeStep,
  command: string,
  commandArguments: string[],
  workingDirectory: string,
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

/** Describe the corrective action for a failed project validation step. */
export function smokeFixHint(step: SmokeStep): string {
  return FIX_HINTS[step];
}

/** Select project validation steps for the requested execution mode. */
export function resolveSmokeSteps(
  configuration: NormalizedProjectConfig,
  agentMode: boolean,
): SmokeStep[] {
  return resolveSmokePlan(configuration, agentMode) as SmokeStep[];
}

/** Build the selected package manager's project validation command. */
export function resolveSmokeCommand(
  step: SmokeStep,
  packageManager: PackageManager,
): { command: string; commandArguments: string[] } {
  return resolvePackageManagerDriver(packageManager).runScript(step);
}

function readRootScripts(directory: string): Record<string, string> | null {
  const manifestPath = join(directory, "package.json");
  if (!existsSync(manifestPath)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    scripts?: Record<string, string>;
  };
  return manifest.scripts ?? null;
}

async function defaultSmokeRunner(
  _step: SmokeStep,
  command: string,
  commandArguments: string[],
  workingDirectory: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await execa(command, commandArguments, {
    cwd: workingDirectory,
    stdio: ["ignore", "pipe", "pipe"],
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 1,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

/** Run project validation scripts in order and report the first failure with a fix hint. */
export async function runSmokeValidation(
  directory: string,
  steps: SmokeStep[],
  options: {
    packageManager?: PackageManager;
    /** Replace process execution for validation commands. */
    runner?: SmokeRunner;
    /** Announce the validation step about to run. */
    onStepStart?: (step: SmokeStep) => void;
    /** Announce a successfully completed validation step. */
    onStepComplete?: (step: SmokeStep) => void;
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

    const { command, commandArguments } = resolveSmokeCommand(step, packageManager);
    options.onStepStart?.(step);
    const result = await runner(step, command, commandArguments, directory);

    if (result.exitCode !== 0) {
      return {
        ok: false,
        failedStep: step,
        exitCode: result.exitCode,
        stderr: [result.stdout, result.stderr].filter(Boolean).join("\n") || `${step} failed`,
        fixHint: smokeFixHint(step),
        completedSteps,
      };
    }

    completedSteps.push(step);
    options.onStepComplete?.(step);
  }

  return { ok: true, steps, completedSteps };
}

/** Format the failed validation command's diagnostics and suggested next action. */
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
