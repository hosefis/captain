import type { NormalizedProjectConfig } from "../schema/project-config.js";

export type RecipeStep = {
  id: string;
  phase: "workspace" | "module" | "adapter" | "config" | "install";
  description: string;
};

export function resolveRecipePlan(config: NormalizedProjectConfig): RecipeStep[] {
  const steps: RecipeStep[] = [
    {
      id: "project-structure",
      phase: "workspace",
      description:
        config.topology === "monorepo"
          ? "Configure Turborepo workspace and shared packages"
          : "Configure framework-native src directories",
    },
    {
      id: "context-md",
      phase: "config",
      description: "Emit CONTEXT.md stub for agent/human onboarding",
    },
    {
      id: "env-example",
      phase: "config",
      description: "Emit .env.example with selected integration placeholders",
    },
    {
      id: "project-json",
      phase: "config",
      description: "Write project.json with resolved CAPTAIN config",
    },
  ];

  if (config.backend === "rest") {
    steps.push({
      id: "backend-rest",
      phase: "adapter",
      description: "BackendClient adapter for backend: rest",
    });
  }

  if (config.auth !== "none") {
    steps.push({
      id: "module-authorization",
      phase: "module",
      description: "Authorization module (authorize → Allow | Redirect | Deny)",
    });
    steps.push({
      id: `auth-${config.auth}`,
      phase: "adapter",
      description: `Auth adapter: ${config.auth}`,
    });
  }

  if (config.i18n.web) {
    steps.push({
      id: `i18n-web-${config.i18n.web}`,
      phase: "adapter",
      description: `Web i18n adapter: ${config.i18n.web}`,
    });
    steps.push({
      id: "i18n-enforcement",
      phase: "module",
      description: "i18n enforcement (ESLint hardcoded strings ban + i18n:check script)",
    });
  }

  if (config.i18n.mobile && config.i18n.mobile !== "none") {
    steps.push({
      id: `i18n-mobile-${config.i18n.mobile}`,
      phase: "adapter",
      description: `Mobile i18n adapter: ${config.i18n.mobile}`,
    });
    steps.push({
      id: "expo-localization",
      phase: "install",
      description: "Install expo-localization (always on Expo)",
    });
  }

  if (config.ui.web) {
    steps.push({
      id: `ui-web-${config.ui.web}`,
      phase: "adapter",
      description: `Web UI adapter: ${config.ui.web}`,
    });
  }

  if (config.ui.mobile) {
    steps.push({
      id: `ui-mobile-${config.ui.mobile}`,
      phase: "adapter",
      description: `Mobile UI adapter: ${config.ui.mobile}`,
    });
  }

  if (config.backend === "convex") {
    steps.push({
      id: "backend-convex",
      phase: "adapter",
      description: "Set up the Convex backend and application providers",
    });
  }

  return steps;
}

export function resolveSmokePlan(_config: NormalizedProjectConfig, agentMode: boolean): string[] {
  const steps = ["typecheck", "lint"];
  if (agentMode) {
    steps.push("build");
  }
  return steps;
}
