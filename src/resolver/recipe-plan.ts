import type { NormalizedProjectConfiguration } from "../schema/project-configuration.js";

/** Planned generation step and its execution phase. */
export type RecipeStep = {
  id: string;
  phase: "workspace" | "module" | "adapter" | "config" | "install";
  description: string;
};

/** Orders generation steps for the selected project integrations and guidance. */
export function resolveRecipePlan(configuration: NormalizedProjectConfiguration): RecipeStep[] {
  const steps: RecipeStep[] = [
    {
      id: "project-structure",
      phase: "workspace",
      description:
        configuration.topology === "monorepo"
          ? "Configure Turborepo workspace and shared packages"
          : "Configure framework-native src directories",
    },
    {
      id: "context-md",
      phase: "config",
      description: "Write CONTEXT.md for developer and agent onboarding",
    },
    {
      id: "agent-guidance",
      phase: "config",
      description: "Preserve framework guidance and synchronize AGENTS.md and CLAUDE.md",
    },
    {
      id: "env-example",
      phase: "config",
      description: "Emit .env.example with selected integration placeholders",
    },
  ];

  if (configuration.backend === "rest") {
    steps.push({
      id: "backend-rest",
      phase: "adapter",
      description: "BackendClient adapter for backend: rest",
    });
  }

  if (configuration.auth !== "none") {
    steps.push({
      id: "module-authorization",
      phase: "module",
      description: "Authorization module (authorize → Allow | Redirect | Deny)",
    });
    steps.push({
      id: `auth-${configuration.auth}`,
      phase: "adapter",
      description: `Auth adapter: ${configuration.auth}`,
    });
  }

  if (configuration.i18n.web) {
    steps.push({
      id: `i18n-web-${configuration.i18n.web}`,
      phase: "adapter",
      description: `Web i18n adapter: ${configuration.i18n.web}`,
    });
    steps.push({
      id: "i18n-enforcement",
      phase: "module",
      description: "i18n enforcement (ESLint hardcoded strings ban + i18n:check script)",
    });
  }

  if (configuration.i18n.mobile && configuration.i18n.mobile !== "none") {
    steps.push({
      id: `i18n-mobile-${configuration.i18n.mobile}`,
      phase: "adapter",
      description: `Mobile i18n adapter: ${configuration.i18n.mobile}`,
    });
    steps.push({
      id: "expo-localization",
      phase: "install",
      description: "Install expo-localization (always on Expo)",
    });
  }

  if (configuration.ui.web) {
    steps.push({
      id: `ui-web-${configuration.ui.web}`,
      phase: "adapter",
      description: `Web UI adapter: ${configuration.ui.web}`,
    });
  }

  if (configuration.ui.mobile) {
    steps.push({
      id: `ui-mobile-${configuration.ui.mobile}`,
      phase: "adapter",
      description: `Mobile UI adapter: ${configuration.ui.mobile}`,
    });
  }

  if (configuration.backend === "convex") {
    steps.push({
      id: "backend-convex",
      phase: "adapter",
      description: "Set up the Convex backend and application providers",
    });
  }

  if (configuration.enforceCodeStandards) {
    steps.push({
      id: "code-standards",
      phase: "config",
      description: "Copy standalone standards checker and extend framework and workspace lint commands",
    });
  }
  steps.push({
    id: "starter-documentation",
    phase: "install",
    description: "Document recognized editable starter exports after dependency installation",
  });
  if (configuration.stacks.hasMobile) {
    steps.push({
      id: "expo-starter-lint",
      phase: "install",
      description: "Preserve framework ESLint configuration and Expo starter hydration compatibility",
    });
  }

  return steps;
}

/** Selects validation commands for interactive or agent-driven scaffolding. */
export function resolveSmokePlan(_configuration: NormalizedProjectConfiguration, agentMode: boolean): string[] {
  const steps = ["typecheck", "lint"];
  if (agentMode) {
    steps.push("build");
  }
  return steps;
}
