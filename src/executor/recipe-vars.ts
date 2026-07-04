import type { NormalizedProjectConfig } from "../schema/project-config.js";

export type RecipeVars = Record<string, string>;

export function buildRecipeVars(config: NormalizedProjectConfig): RecipeVars {
  const scopeName = config.scope.replace(/^@/, "");
  const primaryProcessor =
    config.payment.primary ?? config.payment.processors[0] ?? "custom-api";

  return {
    scope: config.scope,
    scopeName,
    name: config.name,
    corePackage: `${config.scope}/core`,
    adapterNextPackage: `${config.scope}/adapters-next`,
    adapterExpoPackage: `${config.scope}/adapters-expo`,
    adapterDesktopPackage: `${config.scope}/adapters-desktop`,
    locales: config.locales.join(","),
    defaultLocale: config.defaultLocale,
    backend: config.backend,
    auth: config.auth,
    orchestration: config.payment.orchestration,
    primaryProcessor,
  };
}
