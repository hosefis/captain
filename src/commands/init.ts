import { resolve } from "node:path";
import * as p from "@clack/prompts";
import type { GlobalCliOptions } from "../cli-options.js";
import { runBootstrapPhase } from "../executor/run-bootstrap-phase.js";
import type { RunBootstrapPhaseOptions } from "../executor/run-bootstrap-phase.js";
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
  loadProjectConfigFromFile,
  type NormalizedProjectConfig,
} from "../schema/project-config.js";
import type { Command } from "commander";
import { getGlobalOptions } from "../cli-options.js";
import {
  formatVerifyDocsReport,
  runVerifyDocs,
  type NpmFetch,
  type VerifyDocsResult,
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
      cwd: string;
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
  | { status: "blocked"; compatibility: CompatibilityResult; config: NormalizedProjectConfig }
  | {
      status: "doc_drift_blocked";
      config: NormalizedProjectConfig;
      verifyDocs: VerifyDocsResult;
    }
  | {
      status: "dry_run";
      config: NormalizedProjectConfig;
      compatibility: CompatibilityResult;
      plan: InitPlan;
      verifyDocs?: VerifyDocsResult;
    }
  | {
      status: "success";
      config: NormalizedProjectConfig;
      compatibility: CompatibilityResult;
      plan: InitPlan;
      directory: string;
      completedBootstrapSteps: string[];
      appliedRecipes: string[];
      smoke: SmokeRunResult;
      verifyDocs?: VerifyDocsResult;
    }
  | {
      status: "smoke_failed";
      config: NormalizedProjectConfig;
      compatibility: CompatibilityResult;
      plan: InitPlan;
      directory: string;
      completedBootstrapSteps: string[];
      appliedRecipes: string[];
      smoke: Extract<SmokeRunResult, { ok: false }>;
      verifyDocs?: VerifyDocsResult;
    }
  | {
      status: "execution_failed";
      config: NormalizedProjectConfig;
      compatibility: CompatibilityResult;
      plan: InitPlan;
      directory: string;
      phase: "bootstrap" | "workspace" | "config" | "recipes" | "install";
      message: string;
    };

export type InitOptions = GlobalCliOptions & {
  directory: string;
  /** Test hook: mock npm registry lookups for --verify-docs */
  npmFetch?: NpmFetch;
  /** Test hook: mock Phase 3 smoke runner */
  smokeRunner?: SmokeRunner;
  /** Test hook: skip Phase 3 smoke (bootstrap/recipe integration tests) */
  skipSmoke?: boolean;
  /** Test hook: inject bootstrap execution without network access. */
  bootstrapOptions?: RunBootstrapPhaseOptions;
};

function isAgentMode(options: InitOptions): boolean {
  return Boolean(options.config);
}

async function loadConfig(options: InitOptions): Promise<
  | { ok: true; config: NormalizedProjectConfig }
  | { ok: false; message: string }
  | { ok: false; cancelled: true }
> {
  if (options.config) {
    try {
      const config = loadProjectConfigFromFile(options.config);
      return { ok: true, config };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to parse project.json";
      return { ok: false, message };
    }
  }

  const wizard = await runWizard();
  if (wizard.cancelled) {
    return { ok: false, cancelled: true };
  }

  return { ok: true, config: wizard.config };
}

async function confirmWarnings(
  compatibility: CompatibilityResult,
  skipConfirm: boolean,
): Promise<boolean> {
  if (compatibility.warns.length === 0 || skipConfirm) {
    return true;
  }

  console.warn(formatCompatibilityResult(compatibility));

  const proceed = await p.confirm({
    message: "Compatibility warnings found — continue anyway?",
    initialValue: false,
  });

  if (p.isCancel(proceed) || !proceed) {
    p.cancel("Init cancelled due to compatibility warnings.");
    return false;
  }

  return true;
}

export function buildInitPlan(
  config: NormalizedProjectConfig,
  directory: string,
  agentMode: boolean,
): InitPlan {
  const bootstrap = resolveBootstrapPlan(config, directory);
  const recipes = resolveRecipePlan(config);

  return {
    phase1: {
      bootstrap: bootstrap.map((step) => ({
        id: step.id,
        description: step.description,
        command: formatBootstrapCommand(step),
        cwd: step.cwd,
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
      smoke: resolveSmokePlan(config, agentMode),
    },
  };
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const loaded = await loadConfig(options);
  if (!loaded.ok) {
    if ("cancelled" in loaded && loaded.cancelled) {
      return { status: "cancelled" };
    }
    return { status: "validation_error", message: "message" in loaded ? loaded.message : "Invalid config" };
  }

  const config = loaded.config;
  const directory = resolve(options.directory);
  const agentMode = isAgentMode(options);

  const compatibility = resolveCompatibility(config, {
    mode: agentMode ? "agent" : "human",
  });

  if (!compatibility.ok) {
    return { status: "blocked", compatibility, config };
  }

  let verifyDocs: VerifyDocsResult | undefined;
  if (options.verifyDocs) {
    verifyDocs = await runVerifyDocs(config, {
      agentMode,
      npmFetch: options.npmFetch,
    });

    if (!verifyDocs.ok) {
      return { status: "doc_drift_blocked", config, verifyDocs };
    }
  }

  if (!agentMode) {
    const confirmed = await confirmWarnings(compatibility, options.yes ?? false);
    if (!confirmed) {
      return { status: "cancelled" };
    }
  }

  const plan = buildInitPlan(config, directory, agentMode);

  if (options.dryRun) {
    return { status: "dry_run", config, compatibility, plan, verifyDocs };
  }

  const execution = await runBootstrapPhase(
    config,
    directory,
    options.bootstrapOptions,
  );

  if (!execution.ok) {
    return {
      status: "execution_failed",
      config,
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
      config,
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
    packageManager: config.packageManager,
    runner: options.smokeRunner,
  });

  if (!smoke.ok) {
    return {
      status: "smoke_failed",
      config,
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
    config,
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
    console.log(`    cwd: ${step.cwd}`);
  }

  console.log("\nPhase 2 — Recipes");
  for (const step of result.plan.phase2.recipes) {
    console.log(`  • [${step.phase}] ${step.description}`);
  }

  console.log("\nPhase 3 — Smoke");
  console.log(`  • ${result.plan.phase3.smoke.join(" → ")}`);
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
      console.error(formatVerifyDocsReport(result.verifyDocs));
    }
    process.exit(1);
  }

  if (result.status === "dry_run") {
    const payload = {
      status: "dry-run",
      config: result.config,
      compatibility: result.compatibility,
      plan: result.plan,
      verifyDocs: result.verifyDocs,
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      if (result.verifyDocs) {
        console.log(formatVerifyDocsReport(result.verifyDocs));
        console.log("");
      }
      printHumanPlan(result);
      if (result.compatibility.warns.length > 0) {
        console.log("\nWarnings:");
        console.log(formatCompatibilityResult(result.compatibility));
      }
      console.log("\nDry run complete — no files were written.");
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
      if (result.verifyDocs) {
        console.log(formatVerifyDocsReport(result.verifyDocs));
        console.log("");
      }
      p.log.success("CAPTAIN init complete (Phase 1 + Phase 2 recipes).");
      console.log("\nCompleted bootstrap steps:");
      for (const stepId of result.completedBootstrapSteps) {
        console.log(`  • ${stepId}`);
      }
      console.log("\nApplied recipes:");
      for (const recipeId of result.appliedRecipes) {
        console.log(`  • ${recipeId}`);
      }
      const pending = payload.pendingRecipes;
      if (pending.length > 0) {
        console.log("\nPending recipes:");
        for (const step of pending) {
          console.log(`  • [${step.phase}] ${step.description}`);
        }
      }
      console.log(`\nSmoke complete: ${result.smoke.completedSteps.join(" → ")}`);
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

export function registerInitCommand(program: Command): void {
  program
    .command("init", { isDefault: true })
    .description("Scaffold a new CAPTAIN project")
    .argument("[directory]", "Target directory", ".")
    .action(async (directory: string, _options: unknown, command: Command) => {
      const globals = getGlobalOptions(command);

      const result = await runInit({
        ...globals,
        directory,
      });

      handleInitResult(result, globals.json ?? false);
    });
}
