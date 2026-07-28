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

function appBootstrapScripts(kind: "web" | "mobile"): Record<string, string> {
  if (kind === "web") {
    return { dev: "next dev", build: "next build", lint: "eslint .", typecheck: "tsc --noEmit" };
  }

  return {
    start: "expo start",
    build: "expo export",
    lint: "eslint .",
    typecheck: "tsc --noEmit",
  };
}

function writeAppBootstrap(targetDirectory: string, kind: "web" | "mobile"): void {
  writeFileSync(
    join(targetDirectory, "package.json"),
    `${JSON.stringify({ name: `temp-${kind}`, scripts: appBootstrapScripts(kind) }, null, 2)}\n`,
  );

  if (kind === "web") {
    writeFileSync(join(targetDirectory, "next.config.ts"), "export default {};\n");
    return;
  }

  writeFileSync(
    join(targetDirectory, "app.json"),
    `${JSON.stringify({ expo: { name: "temp-expo" } }, null, 2)}\n`,
  );
}

function simulateWebBootstrap(targetDirectory: string): void {
  writeAppBootstrap(targetDirectory, "web");
}

function simulateMobileBootstrap(targetDirectory: string): void {
  writeAppBootstrap(targetDirectory, "mobile");
}

function simulateMonorepoBootstrap(
  targetDirectory: string,
  config: NormalizedProjectConfig,
): void {
  writeFileSync(
    join(targetDirectory, "package.json"),
    `${JSON.stringify({ name: "temp-turbo", private: true }, null, 2)}\n`,
  );
  writeFileSync(
    join(targetDirectory, "pnpm-workspace.yaml"),
    'packages:\n  - "apps/*"\n',
    "utf-8",
  );

  if (config.stacks.hasWeb) {
    mkdirSync(join(targetDirectory, "apps", "web"), { recursive: true });
    writeAppBootstrap(join(targetDirectory, "apps", "web"), "web");
  }

  if (config.stacks.hasMobile) {
    mkdirSync(join(targetDirectory, "apps", "mobile"), { recursive: true });
    writeAppBootstrap(join(targetDirectory, "apps", "mobile"), "mobile");
  }
}

function simulateBootstrapOutput(
  config: NormalizedProjectConfig,
  targetDirectory: string,
): void {
  if (config.topology === "web") {
    simulateWebBootstrap(targetDirectory);
    return;
  }

  if (config.topology === "mobile") {
    simulateMobileBootstrap(targetDirectory);
    return;
  }

  simulateMonorepoBootstrap(targetDirectory, config);
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

  if (options.simulateBootstrapOutput) {
    simulateBootstrapOutput(config, targetDirectory);
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
