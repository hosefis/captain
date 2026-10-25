import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type ts from "typescript";
import { resolveBootstrapPlan } from "../resolver/bootstrap.js";
import type { NormalizedProjectConfiguration } from "../schema/project-configuration.js";
import { emitProjectGuidance } from "./project-guidance.js";
import { applyRecipes } from "./apply-recipes.js";
import {
  runBootstrapPlan,
  type BootstrapRunResult,
  type BootstrapRunner,
} from "./bootstrap-run.js";
import { applyProjectStructure } from "./project-structure.js";
import { resolvePackageManagerDriver } from "./package-manager.js";
import { documentStarterSource, findStarterSourceFiles } from "./starter-documentation.js";
import { applyExpoStarterLintCompatibility } from "./expo-lint-compatibility.js";

/** Outcome of framework scaffolding, integration generation, and dependency installation. */
export type BootstrapPhaseResult =
  | {
      ok: true;
      completedBootstrapSteps: string[];
      appliedRecipes: string[];
    }
  | {
      ok: false;
      phase: "bootstrap" | "workspace" | "config" | "recipes" | "install";
      message: string;
      bootstrap?: BootstrapRunResult;
    };

/** Progress reporting and execution overrides used during scaffold bootstrap. */
export type RunBootstrapPhaseOptions = {
  /** Reports the start and completion of a scaffold step. */
  onProgress?: (event: {
    status: "start" | "complete";
    id: string;
    description: string;
  }) => void;
  /** Executes scaffold commands with an optional caller-supplied runner. */
  bootstrapRunner?: BootstrapRunner;
  /** Simulate create-next-app output when using a mock runner (standalone topologies). */
  simulateBootstrapOutput?: boolean;
  /** Supplies an explicit compiler for simulated starters without dependency installation. */
  starterCompiler?: typeof ts;
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
  configuration: NormalizedProjectConfiguration,
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

  if (configuration.stacks.hasWeb) {
    mkdirSync(join(targetDirectory, "apps", "web"), { recursive: true });
    writeAppBootstrap(join(targetDirectory, "apps", "web"), "web");
  }

  if (configuration.stacks.hasMobile) {
    mkdirSync(join(targetDirectory, "apps", "mobile"), { recursive: true });
    writeAppBootstrap(join(targetDirectory, "apps", "mobile"), "mobile");
  }
}

function simulateBootstrapOutput(
  configuration: NormalizedProjectConfiguration,
  targetDirectory: string,
): void {
  if (configuration.topology === "web") {
    simulateWebBootstrap(targetDirectory);
    return;
  }

  if (configuration.topology === "mobile") {
    simulateMobileBootstrap(targetDirectory);
    return;
  }

  simulateMonorepoBootstrap(targetDirectory, configuration);
}

/** Scaffolds frameworks, applies project integrations, and installs dependencies. */
export async function runBootstrapPhase(
  configuration: NormalizedProjectConfiguration,
  targetDirectory: string,
  options: RunBootstrapPhaseOptions = {},
): Promise<BootstrapPhaseResult> {
  mkdirSync(targetDirectory, { recursive: true });

  const steps = resolveBootstrapPlan(configuration, targetDirectory);
  const bootstrapResult = await runBootstrapPlan(steps, {
    runner: options.bootstrapRunner,
    onStepStart: (step) =>
      options.onProgress?.({
        status: "start",
        id: step.id,
        description: step.description,
      }),
    onStepComplete: (step) =>
      options.onProgress?.({
        status: "complete",
        id: step.id,
        description: step.description,
      }),
  });

  if (!bootstrapResult.ok) {
    const details = bootstrapResult.stderr.trim();
    return {
      ok: false,
      phase: "bootstrap",
      message: `Bootstrap step "${bootstrapResult.failedStep.id}" failed (exit ${bootstrapResult.exitCode})${details ? `: ${details}` : ""}`,
      bootstrap: bootstrapResult,
    };
  }

  if (options.simulateBootstrapOutput) {
    simulateBootstrapOutput(configuration, targetDirectory);
  }
  const starterSourceFiles = findStarterSourceFiles(targetDirectory);

  try {
    options.onProgress?.({
      status: "start",
      id: "project-structure",
      description:
        configuration.topology === "monorepo"
          ? "Configure Turborepo workspace"
          : "Configure standalone source layout",
    });
    applyProjectStructure(configuration, targetDirectory);
    options.onProgress?.({
      status: "complete",
      id: "project-structure",
      description:
        configuration.topology === "monorepo"
          ? "Configured Turborepo workspace"
          : "Configured standalone source layout",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project structure setup failed";
    return { ok: false, phase: "workspace", message };
  }

  try {
    options.onProgress?.({
      status: "start",
      id: "config",
      description: "Write project documentation and environment examples",
    });
    emitProjectGuidance(configuration, targetDirectory);
    options.onProgress?.({
      status: "complete",
      id: "config",
      description: "Wrote project documentation and environment examples",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Config emit failed";
    return { ok: false, phase: "config", message };
  }

  const recipesResult = applyRecipes(configuration, targetDirectory, {
    onStepStart: (step) =>
      options.onProgress?.({
        status: "start",
        id: step.id,
        description: step.description,
      }),
    onStepComplete: (step) =>
      options.onProgress?.({
        status: "complete",
        id: step.id,
        description: step.description,
      }),
  });
  if (!recipesResult.ok) {
    return {
      ok: false,
      phase: "recipes",
      message: `Recipe step "${recipesResult.stepId}" failed: ${recipesResult.message}`,
    };
  }

  const install = resolvePackageManagerDriver(configuration.packageManager).install;
  const installResult = await runBootstrapPlan(
    [
      {
        id: "install-root",
        description: `Install ${configuration.packageManager} dependencies`,
        command: install.command,
        commandArguments: install.commandArguments,
        workingDirectory: targetDirectory,
      },
    ],
    {
      runner: options.bootstrapRunner,
      onStepStart: (step) =>
        options.onProgress?.({
          status: "start",
          id: step.id,
          description: step.description,
        }),
      onStepComplete: (step) =>
        options.onProgress?.({
          status: "complete",
          id: step.id,
          description: step.description,
        }),
    },
  );
  if (!installResult.ok) {
    const details = installResult.stderr.trim();
    return {
      ok: false,
      phase: "install",
      message: `Root dependency installation failed (exit ${installResult.exitCode})${details ? `: ${details}` : ""}`,
      bootstrap: installResult,
    };
  }

  try {
    options.onProgress?.({ status: "start", id: "starter-documentation", description: "Document recognized editable framework starter exports" });
    documentStarterSource(targetDirectory, options.starterCompiler, starterSourceFiles);
    options.onProgress?.({ status: "complete", id: "starter-documentation", description: "Prepared editable framework starter documentation" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Starter documentation failed";
    return { ok: false, phase: "recipes", message: `Starter documentation failed: ${message}` };
  }

  if (configuration.stacks.hasMobile) {
    try {
      options.onProgress?.({ status: "start", id: "expo-starter-lint", description: "Preserve Expo starter lint compatibility" });
      const mobileDirectory = configuration.topology === "monorepo" ? join(targetDirectory, "apps/mobile") : targetDirectory;
      applyExpoStarterLintCompatibility(mobileDirectory, options.starterCompiler);
      options.onProgress?.({ status: "complete", id: "expo-starter-lint", description: "Preserved Expo starter lint compatibility" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Expo starter lint compatibility failed";
      return { ok: false, phase: "recipes", message: `Expo starter lint compatibility failed: ${message}` };
    }
  }

  return {
    ok: true,
    completedBootstrapSteps: [
      ...bootstrapResult.completedSteps,
      ...installResult.completedSteps,
    ],
    appliedRecipes: [
      "project-structure",
      "context-md",
      "env-example",
      "agent-guidance",
      ...recipesResult.appliedRecipes,
      "starter-documentation",
      ...(configuration.stacks.hasMobile ? ["expo-starter-lint"] : []),
    ],
  };
}
