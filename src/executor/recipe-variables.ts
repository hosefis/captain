import type { NormalizedProjectConfiguration } from "../schema/project-configuration.js";

export type RecipeVariables = Record<string, string>;

/** Resolve project names and stack selections for recipe template substitution. */
export function buildRecipeVariables(configuration: NormalizedProjectConfiguration): RecipeVariables {
  const scopeName = configuration.scope.replace(/^@/, "");

  return {
    scope: configuration.scope,
    scopeName,
    name: configuration.name,
    corePackage:
      configuration.topology === "monorepo" ? `${configuration.scope}/core` : "@/lib",
    adapterNextPackage: `${configuration.scope}/adapters-next`,
    adapterExpoPackage: `${configuration.scope}/adapters-expo`,
    adapterDesktopPackage: `${configuration.scope}/adapters-desktop`,
    locales: configuration.locales.join(","),
    defaultLocale: configuration.defaultLocale,
    backend: configuration.backend,
    auth: configuration.auth,
  };
}
