import { rm } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import type { BootstrapStep } from "../resolver/bootstrap.js";

/** Execute one scaffold command and capture its process result. */
export type BootstrapRunner = (
  step: BootstrapStep,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export type RunBootstrapOptions = {
  workingDirectory?: string;
  /** Replace command execution while preserving bootstrap sequencing. */
  runner?: BootstrapRunner;
  /** Announce the command about to run. */
  onStepStart?: (step: BootstrapStep) => void;
  /** Announce a successfully completed command. */
  onStepComplete?: (step: BootstrapStep) => void;
};

async function defaultRunner(
  step: BootstrapStep,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  if (step.command === "(slot)") {
    return { exitCode: 0, stdout: "", stderr: "" };
  }

  const result = await execa(step.command, step.commandArguments, {
    cwd: step.workingDirectory,
    stdio: ["ignore", "pipe", "pipe"],
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 1,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

/** Remove an existing app dir so create-* can scaffold fresh (monorepo turbo ships default apps). */
async function prepareAppTarget(step: BootstrapStep): Promise<void> {
  if (step.id !== "bootstrap-apps-web" && step.id !== "bootstrap-apps-mobile") {
    return;
  }

  const appArgument = step.commandArguments.find((argument) => argument.startsWith("apps/"));
  if (!appArgument) {
    return;
  }

  const appPath = join(step.workingDirectory, appArgument);
  await rm(appPath, { recursive: true, force: true });
}

export type BootstrapRunResult =
  | { ok: true; completedSteps: string[] }
  | { ok: false; failedStep: BootstrapStep; exitCode: number; stderr: string };

/** Execute scaffold commands in order, stopping at the first failure. */
export async function runBootstrapPlan(
  steps: BootstrapStep[],
  options: RunBootstrapOptions = {},
): Promise<BootstrapRunResult> {
  const runner = options.runner ?? defaultRunner;
  const completedSteps: string[] = [];

  for (const step of steps) {
    options.onStepStart?.(step);

    if (step.command === "(slot)") {
      completedSteps.push(step.id);
      options.onStepComplete?.(step);
      continue;
    }

    await prepareAppTarget(step);
    const result = await runner(step);

    if (result.exitCode !== 0) {
      return {
        ok: false,
        failedStep: step,
        exitCode: result.exitCode,
        stderr: result.stderr || result.stdout,
      };
    }

    completedSteps.push(step.id);
    options.onStepComplete?.(step);
  }

  return { ok: true, completedSteps };
}
