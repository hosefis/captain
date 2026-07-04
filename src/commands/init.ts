import { resolve } from "node:path";
import * as p from "@clack/prompts";
import type { GlobalCliOptions } from "../cli-options.js";
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
  | { status: "dry_run"; config: NormalizedProjectConfig; compatibility: CompatibilityResult; plan: InitPlan }
  | { status: "pending_execution"; config: NormalizedProjectConfig; compatibility: CompatibilityResult; plan: InitPlan };

export type InitOptions = GlobalCliOptions & {
  directory: string;
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

  if (!agentMode) {
    const confirmed = await confirmWarnings(compatibility, options.yes ?? false);
    if (!confirmed) {
      return { status: "cancelled" };
    }
  }

  const plan = buildInitPlan(config, directory, agentMode);

  if (options.dryRun) {
    return { status: "dry_run", config, compatibility, plan };
  }

  return { status: "pending_execution", config, compatibility, plan };
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

  if (result.status === "dry_run") {
    const payload = {
      status: "dry-run",
      config: result.config,
      compatibility: result.compatibility,
      plan: result.plan,
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      printHumanPlan(result);
      if (result.compatibility.warns.length > 0) {
        console.log("\nWarnings:");
        console.log(formatCompatibilityResult(result.compatibility));
      }
      console.log("\nDry run complete — no files were written.");
    }
    process.exit(0);
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          status: "pending_execution",
          message: "Bootstrap execution is not wired yet (Milestone 3).",
          config: result.config,
          compatibility: result.compatibility,
          plan: result.plan,
        },
        null,
        2,
      ),
    );
  } else {
    printHumanPlan(result);
    console.error(
      "\nBootstrap execution is not wired yet (Milestone 3). Re-run with --dry-run to preview the plan.",
    );
  }
  process.exit(1);
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
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
