import type { NormalizedProjectConfig, PaymentProcessor } from "../schema/project-config.js";

function resolvePaymentRecipeProcessors(config: NormalizedProjectConfig): PaymentProcessor[] {
  const processors = [...config.payment.processors];

  if (
    processors.includes("stripe") &&
    config.auth === "clerk" &&
    !processors.includes("clerk-billing")
  ) {
    return processors.filter((processor) => processor !== "stripe").concat("clerk-billing");
  }

  return processors;
}

export type RecipeStep = {
  id: string;
  phase: "workspace" | "module" | "adapter" | "config" | "install";
  description: string;
};

export function resolveRecipePlan(config: NormalizedProjectConfig): RecipeStep[] {
  const steps: RecipeStep[] = [
    {
      id: "workspace-promote",
      phase: "workspace",
      description: "Promote to mini-monorepo: pnpm-workspace.yaml, packages/core, packages/adapters-*",
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

  steps.push({
    id: `backend-${config.backend}`,
    phase: "adapter",
    description: `BackendClient adapter for backend: ${config.backend}`,
  });

  if (config.auth !== "skip") {
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

  if (config.i18n.mobile) {
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

  for (const moduleId of config.modules) {
    if (moduleId === "authorization") {
      continue;
    }
    steps.push({
      id: `module-${moduleId}`,
      phase: "module",
      description: `Deep module: ${moduleId}`,
    });
  }

  if (config.payment.enabled) {
    for (const processor of resolvePaymentRecipeProcessors(config)) {
      steps.push({
        id: `payment-${processor}`,
        phase: "adapter",
        description: `PaymentCheckout adapter: ${processor} (${config.payment.orchestration})`,
      });
    }
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
