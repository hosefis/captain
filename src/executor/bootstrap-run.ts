import { rm } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";
import type { BootstrapStep } from "../resolver/bootstrap.js";

export type BootstrapRunner = (
  step: BootstrapStep,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

export type RunBootstrapOptions = {
  cwd?: string;
  runner?: BootstrapRunner;
  onStepStart?: (step: BootstrapStep) => void;
  onStepComplete?: (step: BootstrapStep) => void;
};

async function defaultRunner(
  step: BootstrapStep,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  if (step.command === "(slot)") {
    return { exitCode: 0, stdout: "", stderr: "" };
  }

  const child = execa(step.command, step.args, {
    cwd: step.cwd,
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

/** Remove an existing app dir so create-* can scaffold fresh (monorepo turbo ships default apps). */
async function prepareAppTarget(step: BootstrapStep): Promise<void> {
  if (step.id !== "bootstrap-apps-web" && step.id !== "bootstrap-apps-mobile") {
    return;
  }

  const appArg = step.args.find((arg) => arg.startsWith("apps/"));
  if (!appArg) {
    return;
  }

  const appPath = join(step.cwd, appArg);
  await rm(appPath, { recursive: true, force: true });
}

export type BootstrapRunResult =
  | { ok: true; completedSteps: string[] }
  | { ok: false; failedStep: BootstrapStep; exitCode: number; stderr: string };

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
