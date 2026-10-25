import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import * as prompts from "@clack/prompts";
import type { GlobalCliOptions } from "../cli-options.js";
import { runBootstrapPhase } from "../executor/run-bootstrap-phase.js";
import type { RunBootstrapPhaseOptions } from "../executor/run-bootstrap-phase.js";
import {
  detectPackageManagers,
  type PackageManagerAvailability,
} from "../lib/package-manager-availability.js";
import { runWizard } from "../prompts/wizard.js";
import {
  formatBootstrapCommand,
  resolveBootstrapPlan,
} from "../resolver/bootstrap.js";
import {
  formatCompatibilityResult,
  resolveCompatibility,
  type CompatibilityResult,
} from "../resolver/compatibility.js";
import {
  resolveRecipePlan,
  resolveSmokePlan,
} from "../resolver/recipe-plan.js";
import {
  loadProjectConfigurationFromFile,
  type NormalizedProjectConfiguration,
  type PackageManager,
} from "../schema/project-configuration.js";
import type { Command } from "commander";
import { getGlobalOptions } from "../cli-options.js";
import {
  formatDocumentationVersionReport,
  verifyDocumentationVersions,
  type NpmFetch,
  type DocumentationVerificationResult,
} from "../validators/verify-docs.js";
import {
  formatSmokeFailure,
  runSmokeValidation,
  type SmokeRunner,
  type SmokeRunResult,
  type SmokeStep,
} from "../validators/smoke.js";

export type InitPlan = {
  phase1: {
    bootstrap: Array<{
      id: string;
      description: string;
      command: string;
      workingDirectory: string;
    }>;
  };
  phase2: {
    recipes: Array<{
      id: string;
      phase: string;
      description: string;
    }>;
  };
  phase3: {
    smoke: string[];
  };
};

export type InitResult =
  | { status: "cancelled" }
  | { status: "validation_error"; message: string }
  | { status: "blocked"; compatibility: CompatibilityResult; config: NormalizedProjectConfiguration }
  | {
      status: "doc_drift_blocked";
      config: NormalizedProjectConfiguration;
      verifyDocs: DocumentationVerificationResult;
    }
  | {
      status: "dry_run";
      config: NormalizedProjectConfiguration;
      compatibility: CompatibilityResult;
      plan: InitPlan;
      verifyDocs?: DocumentationVerificationResult;
      warnings: string[];
    }
  | {
      status: "success";
      config: NormalizedProjectConfiguration;
      compatibility: CompatibilityResult;
      plan: InitPlan;
      directory: string;
      completedBootstrapSteps: string[];
      appliedRecipes: string[];
      smoke: SmokeRunResult;
      verifyDocs?: DocumentationVerificationResult;
    }
  | {
      status: "smoke_failed";
      config: NormalizedProjectConfiguration;
      compatibility: CompatibilityResult;
      plan: InitPlan;
      directory: string;
      completedBootstrapSteps: string[];
      appliedRecipes: string[];
      smoke: Extract<SmokeRunResult, { ok: false }>;
      verifyDocs?: DocumentationVerificationResult;
    }
  | {
      status: "execution_failed";
      config: NormalizedProjectConfiguration;
      compatibility: CompatibilityResult;
      plan: InitPlan;
      directory: string;
      phase: "bootstrap" | "workspace" | "config" | "recipes" | "install";
      message: string;
    };

export type InitOptions = GlobalCliOptions & {
  directory?: string;
  /** Test hook: mock npm registry lookups for --verify-docs */
  npmFetch?: NpmFetch;
  /** Test hook: mock Phase 3 smoke runner */
  smokeRunner?: SmokeRunner;
  /** Test hook: skip Phase 3 smoke (bootstrap/recipe integration tests) */
  skipSmoke?: boolean;
  /** Test hook: inject bootstrap execution without network access. */
  bootstrapOptions?: RunBootstrapPhaseOptions;
  /** Report scaffold and smoke-check progress to the caller. */
  onProgress?: RunBootstrapPhaseOptions["onProgress"];
  /** Test hook: supply package manager version-check results. */
  packageManagerAvailability?: PackageManagerAvailability;
};

type StagedProjectConfiguration = {
  path: string;
  contents: string;
};

function stageProjectConfigurationForBootstrap(
  configurationPath: string | undefined,
  targetDirectory: string,
): StagedProjectConfiguration | undefined {
  if (!configurationPath) {
    return undefined;
  }

  const absoluteConfigurationPath = resolve(configurationPath);
  if (
    basename(absoluteConfigurationPath).toLowerCase() !== "project.json" ||
    dirname(absoluteConfigurationPath) !== targetDirectory ||
    !existsSync(absoluteConfigurationPath)
  ) {
    return undefined;
  }

  const staged = {
    path: absoluteConfigurationPath,
    contents: readFileSync(absoluteConfigurationPath, "utf8"),
  };
  unlinkSync(absoluteConfigurationPath);
  return staged;
}

function restoreStagedProjectConfiguration(staged: StagedProjectConfiguration | undefined): void {
  if (staged && !existsSync(staged.path)) {
    writeFileSync(staged.path, staged.contents, "utf8");
  }
}

function isAgentMode(options: InitOptions): boolean {
  return Boolean(options.config);
}

async function loadConfiguration(
  options: InitOptions,
  packageManagerAvailability: PackageManagerAvailability,
): Promise<
  | { ok: true; configuration: NormalizedProjectConfiguration }
  | { ok: false; message: string }
  | { ok: false; cancelled: true }
> {
  if (options.config) {
    try {
      const configuration = loadProjectConfigurationFromFile(options.config);
      return { ok: true, configuration };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to parse project.json";
      return { ok: false, message };
    }
  }

  const wizard = await runWizard({
    yes: options.yes,
    dryRun: options.dryRun,
    packageManagerAvailability,
  });
  if ("error" in wizard) {
    return { ok: false, message: wizard.error };
  }
  if (wizard.cancelled) {
    return { ok: false, cancelled: true };
  }

  return { ok: true, configuration: wizard.configuration };
}

function unavailableManagerMessage(
  selected: PackageManager,
  availability: PackageManagerAvailability,
): string {
  const available = (Object.keys(availability) as PackageManager[]).filter(
    (manager) => availability[manager],
  );
  const choices = available.length > 0
    ? `Available package managers: ${available.join(", ")}.`
    : "No supported package managers are available.";
  return `${selected} is unavailable (its version check failed). ${choices} Install ${selected} and retry, or choose an available package manager.`;
}

async function confirmWarnings(
  compatibility: CompatibilityResult,
  skipConfirmation: boolean,
): Promise<boolean> {
  if (compatibility.warns.length === 0 || skipConfirmation) {
    return true;
  }

  console.warn(formatCompatibilityResult(compatibility));

  const proceed = await prompts.confirm({
    message: "Compatibility warnings found — continue anyway?",
    initialValue: false,
  });

  if (prompts.isCancel(proceed) || !proceed) {
    prompts.cancel("Init cancelled due to compatibility warnings.");
    return false;
  }

  return true;
}

/** Describe bootstrap, recipe, and validation work before executing a scaffold. */
export function buildInitPlan(
  configuration: NormalizedProjectConfiguration,
  directory: string,
  agentMode: boolean,
): InitPlan {
  const bootstrap = resolveBootstrapPlan(configuration, directory);
  const recipes = resolveRecipePlan(configuration);

  return {
    phase1: {
      bootstrap: bootstrap.map((step) => ({
        id: step.id,
        description: step.description,
        command: formatBootstrapCommand(step),
        workingDirectory: step.workingDirectory,
      })),
    },
    phase2: {
      recipes: recipes.map((step) => ({
        id: step.id,
        phase: step.phase,
        description: step.description,
      })),
    },
    phase3: {
      smoke: resolveSmokePlan(configuration, agentMode),
    },
  };
}

/** Validate scaffold input and run the planned project creation phases. */
export async function runInit(options: InitOptions): Promise<InitResult> {
  const packageManagerAvailability =
    options.packageManagerAvailability ?? (await detectPackageManagers());
  const loaded = await loadConfiguration(options, packageManagerAvailability);
  if (!loaded.ok) {
    if ("cancelled" in loaded && loaded.cancelled) {
      return { status: "cancelled" };
    }
    return { status: "validation_error", message: "message" in loaded ? loaded.message : "Invalid config" };
  }

  const configuration = loaded.configuration;
  const unavailableManager = !packageManagerAvailability[configuration.packageManager];
  const managerWarning = unavailableManager
    ? unavailableManagerMessage(configuration.packageManager, packageManagerAvailability)
    : undefined;
  if (managerWarning && !options.dryRun) {
    return { status: "validation_error", message: managerWarning };
  }
  const directory = resolve(options.directory ?? configuration.name);
  const agentMode = isAgentMode(options);

  const compatibility = resolveCompatibility(configuration, {
    mode: agentMode ? "agent" : "human",
  });

  if (!compatibility.ok) {
    return { status: "blocked", compatibility, config: configuration };
  }

  let verifyDocs: DocumentationVerificationResult | undefined;
  if (options.verifyDocs) {
    verifyDocs = await verifyDocumentationVersions(configuration, {
      agentMode,
      npmFetch: options.npmFetch,
    });

    if (!verifyDocs.ok) {
      return { status: "doc_drift_blocked", config: configuration, verifyDocs };
    }
  }

  if (!agentMode) {
    const confirmed = await confirmWarnings(compatibility, options.yes ?? false);
    if (!confirmed) {
      return { status: "cancelled" };
    }
  }

  const plan = buildInitPlan(configuration, directory, agentMode);

  if (options.dryRun) {
    return {
      status: "dry_run",
      config: configuration,
      compatibility,
      plan,
      verifyDocs,
      warnings: managerWarning ? [managerWarning] : [],
    };
  }

  const stagedConfiguration = stageProjectConfigurationForBootstrap(options.config, directory);
  let execution;
  try {
    execution = await runBootstrapPhase(
      configuration,
      directory,
      {
        ...options.bootstrapOptions,
        onProgress: options.onProgress ?? options.bootstrapOptions?.onProgress,
      },
    );
  } finally {
    restoreStagedProjectConfiguration(stagedConfiguration);
  }

  if (!execution.ok) {
    return {
      status: "execution_failed",
      config: configuration,
      compatibility,
      plan,
      directory,
      phase: execution.phase,
      message: execution.message,
    };
  }

  if (options.skipSmoke) {
    const skippedSteps = plan.phase3.smoke as SmokeStep[];
    return {
      status: "success",
      config: configuration,
      compatibility,
      plan,
      directory,
      completedBootstrapSteps: execution.completedBootstrapSteps,
      appliedRecipes: execution.appliedRecipes,
      smoke: { ok: true, steps: skippedSteps, completedSteps: skippedSteps },
      verifyDocs,
    };
  }

  const smoke = await runSmokeValidation(directory, plan.phase3.smoke as SmokeStep[], {
    packageManager: configuration.packageManager,
    runner: options.smokeRunner,
    onStepStart: (step) =>
      options.onProgress?.({
        status: "start",
        id: `smoke-${step}`,
        description: `Run ${step}`,
      }),
    onStepComplete: (step) =>
      options.onProgress?.({
        status: "complete",
        id: `smoke-${step}`,
        description: `Passed ${step}`,
      }),
  });

  if (!smoke.ok) {
    return {
      status: "smoke_failed",
      config: configuration,
      compatibility,
      plan,
      directory,
      completedBootstrapSteps: execution.completedBootstrapSteps,
      appliedRecipes: execution.appliedRecipes,
      smoke,
      verifyDocs,
    };
  }

  return {
    status: "success",
    config: configuration,
    compatibility,
    plan,
    directory,
    completedBootstrapSteps: execution.completedBootstrapSteps,
    appliedRecipes: execution.appliedRecipes,
    smoke,
    verifyDocs,
  };
}

function printHumanPlan(result: Extract<InitResult, { plan: InitPlan }>): void {
  console.log("\nCAPTAIN init plan\n");

  console.log("Phase 1 — Bootstrap");
  for (const step of result.plan.phase1.bootstrap) {
    console.log(`  • ${step.description}`);
    console.log(`    ${step.command}`);
    console.log(`    working directory: ${step.workingDirectory}`);
  }

  console.log("\nPhase 2 — Recipes");
  for (const step of result.plan.phase2.recipes) {
    console.log(`  • [${step.phase}] ${step.description}`);
  }

  console.log("\nPhase 3 — Smoke");
  console.log(`  • ${result.plan.phase3.smoke.join(" → ")}`);
}

function printDryRun(result: Extract<InitResult, { status: "dry_run" }>): void {
  if (result.verifyDocs) {
    console.log(formatDocumentationVersionReport(result.verifyDocs));
    console.log("");
  }
  printHumanPlan(result);
  if (result.compatibility.warns.length > 0) {
    console.log("\nWarnings:");
    console.log(formatCompatibilityResult(result.compatibility));
  }
  if (result.warnings.length > 0) {
    console.log("\nPackage manager warnings:");
    for (const warning of result.warnings) {
      console.log(`  ${warning}`);
    }
  }
  console.log("\nDry run complete — no files were written.");
}

function printCompletedProject(
  result: Extract<InitResult, { status: "success" }>,
  pendingRecipes: InitPlan["phase2"]["recipes"],
): void {
  if (result.verifyDocs) {
    console.log(formatDocumentationVersionReport(result.verifyDocs));
    console.log("");
  }
  prompts.log.success("CAPTAIN init complete (Phase 1 + Phase 2 recipes).");
  console.log("\nCompleted bootstrap steps:");
  for (const stepId of result.completedBootstrapSteps) {
    console.log(`  • ${stepId}`);
  }
  console.log("\nApplied recipes:");
  for (const recipeId of result.appliedRecipes) {
    console.log(`  • ${recipeId}`);
  }
  if (pendingRecipes.length > 0) {
    console.log("\nPending recipes:");
    for (const step of pendingRecipes) {
      console.log(`  • [${step.phase}] ${step.description}`);
    }
  }
  console.log(`\nSmoke complete: ${result.smoke.completedSteps.join(" → ")}`);
}

function handleInitResult(result: InitResult, json: boolean): never {
  if (result.status === "cancelled") {
    process.exit(0);
  }

  if (result.status === "validation_error") {
    if (json) {
      console.log(JSON.stringify({ status: "error", message: result.message }));
    } else {
      console.error(result.message);
    }
    process.exit(1);
  }

  if (result.status === "blocked") {
    const payload = {
      status: "blocked",
      compatibility: result.compatibility,
      config: result.config,
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error("Compatibility check failed:\n");
      console.error(formatCompatibilityResult(result.compatibility));
    }
    process.exit(1);
  }

  if (result.status === "doc_drift_blocked") {
    const payload = {
      status: "doc_drift_blocked",
      verifyDocs: result.verifyDocs,
      config: result.config,
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error("Doc version pre-flight failed:\n");
      console.error(formatDocumentationVersionReport(result.verifyDocs));
    }
    process.exit(1);
  }

  if (result.status === "dry_run") {
    const payload = {
      status: "dry_run",
      config: result.config,
      compatibility: result.compatibility,
      plan: result.plan,
      verifyDocs: result.verifyDocs,
      warnings: result.warnings,
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      printDryRun(result);
    }
    process.exit(0);
  }

  if (result.status === "smoke_failed") {
    const payload = {
      status: "smoke_failed",
      directory: result.directory,
      config: result.config,
      completedBootstrapSteps: result.completedBootstrapSteps,
      appliedRecipes: result.appliedRecipes,
      smoke: result.smoke,
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error(formatSmokeFailure(result.smoke));
    }
    process.exit(1);
  }

  if (result.status === "success") {
    const payload = {
      status: "success",
      directory: result.directory,
      config: result.config,
      completedBootstrapSteps: result.completedBootstrapSteps,
      appliedRecipes: result.appliedRecipes,
      pendingRecipes: result.plan.phase2.recipes.filter(
        (step) => !result.appliedRecipes.includes(step.id),
      ),
      smoke: result.smoke,
      verifyDocs: result.verifyDocs,
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      printCompletedProject(result, payload.pendingRecipes);
    }
    process.exit(0);
  }

  if (result.status === "execution_failed") {
    const payload = {
      status: "error",
      phase: result.phase,
      message: result.message,
      config: result.config,
      plan: result.plan,
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.error(`\nBootstrap failed during ${result.phase}: ${result.message}`);
      printHumanPlan(result);
    }
    process.exit(1);
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          status: "error",
          message: "Unexpected init result",
        },
        null,
        2,
      ),
    );
  } else {
    console.error("\nUnexpected init result.");
  }
  process.exit(1);
}

/** Register project creation as the CLI's default command. */
export function registerInitCommand(program: Command): void {
  program
    .command("init", { isDefault: true })
    .description("Scaffold a new CAPTAIN project")
    .argument("[directory]", "Target directory")
    .action(async (directory: string | undefined, _options: unknown, command: Command) => {
      const globals = getGlobalOptions(command);

      const result = await runInit({
        ...globals,
        directory,
        onProgress: !globals.json
          ? (event) => {
              if (event.status === "start") {
                prompts.log.step(event.description);
                return;
              }
              prompts.log.success(event.description);
            }
          : undefined,
      });

      handleInitResult(result, globals.json ?? false);
    });
}
