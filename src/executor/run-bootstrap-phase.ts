import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBootstrapPlan } from "../resolver/bootstrap.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";
import { applyConfigEmit } from "./config-emit.js";
import { applyRecipes } from "./apply-recipes.js";
import {
  runBootstrapPlan,
  type BootstrapRunResult,
  type BootstrapRunner,
} from "./bootstrap-run.js";
import { applyWorkspacePromotion } from "./workspace-promote.js";

export type BootstrapPhaseResult =
  | {
      ok: true;
      completedBootstrapSteps: string[];
      appliedRecipes: string[];
    }
  | {
      ok: false;
      phase: "bootstrap" | "workspace" | "config" | "recipes";
      message: string;
      bootstrap?: BootstrapRunResult;
    };

export type RunBootstrapPhaseOptions = {
  onBootstrapStep?: (stepId: string) => void;
  bootstrapRunner?: BootstrapRunner;
  /** Simulate create-next-app output when using a mock runner (standalone topologies). */
  simulateBootstrapOutput?: boolean;
};

function simulateWebBootstrap(targetDirectory: string): void {
  writeFileSync(
    join(targetDirectory, "package.json"),
    JSON.stringify({ name: "temp-next", scripts: { dev: "next dev", build: "next build", lint: "eslint ." } }),
  );
  writeFileSync(join(targetDirectory, "next.config.ts"), "export default {};\n");
}

export async function runBootstrapPhase(
  config: NormalizedProjectConfig,
  targetDirectory: string,
  options: RunBootstrapPhaseOptions = {},
): Promise<BootstrapPhaseResult> {
  mkdirSync(targetDirectory, { recursive: true });

  const steps = resolveBootstrapPlan(config, targetDirectory);
  const bootstrapResult = await runBootstrapPlan(steps, {
    runner: options.bootstrapRunner,
    onStepStart: (step) => options.onBootstrapStep?.(step.id),
  });

  if (!bootstrapResult.ok) {
    return {
      ok: false,
      phase: "bootstrap",
      message: `Bootstrap step "${bootstrapResult.failedStep.id}" failed (exit ${bootstrapResult.exitCode})`,
      bootstrap: bootstrapResult,
    };
  }

  if (options.simulateBootstrapOutput && config.topology === "web") {
    simulateWebBootstrap(targetDirectory);
  }

  try {
    applyWorkspacePromotion(config, targetDirectory);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace promotion failed";
    return { ok: false, phase: "workspace", message };
  }

  try {
    applyConfigEmit(config, targetDirectory);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Config emit failed";
    return { ok: false, phase: "config", message };
  }

  const recipesResult = applyRecipes(config, targetDirectory);
  if (!recipesResult.ok) {
    return {
      ok: false,
      phase: "recipes",
      message: `Recipe step "${recipesResult.stepId}" failed: ${recipesResult.message}`,
    };
  }

  return {
    ok: true,
    completedBootstrapSteps: bootstrapResult.completedSteps,
    appliedRecipes: [
      "workspace-promote",
      "context-md",
      "env-example",
      "project-json",
      ...recipesResult.appliedRecipes,
    ],
  };
}
