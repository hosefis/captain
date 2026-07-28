import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyOptionalModuleRecipe, renderCoreIndex } from "./apply-recipes.js";
import { applyConfigEmit } from "./config-emit.js";
import { loadCompatibilityMatrix, resolveCompatibility } from "../resolver/compatibility.js";
import type { CaptainModule, NormalizedProjectConfig } from "../schema/project-config.js";
import {
  loadProjectConfigFromFile,
  moduleSchema,
  parseProjectConfig,
} from "../schema/project-config.js";

export type AddModuleResult =
  | {
      ok: true;
      module: CaptainModule;
      appliedRecipes: string[];
      planned: boolean;
    }
  | { ok: false; message: string };

const ADDABLE_MODULES = new Set<CaptainModule>([
  "admin-catalog",
  "form-wizard",
  "user-identity",
]);

export function parseAddModuleName(input: string): CaptainModule | null {
  const parsed = moduleSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

export function addModuleToProject(options: {
  moduleName: string;
  targetDir: string;
  projectPath?: string;
  force?: boolean;
  dryRun?: boolean;
}): AddModuleResult {
  const targetDir = resolve(options.targetDir);
  const projectPath = resolve(targetDir, options.projectPath ?? "project.json");

  const moduleId = parseAddModuleName(options.moduleName);
  if (!moduleId) {
    return {
      ok: false,
      message: `Unknown module "${options.moduleName}". Choose: admin-catalog, form-wizard, user-identity`,
    };
  }

  if (!ADDABLE_MODULES.has(moduleId)) {
    return {
      ok: false,
      message: `Module "${moduleId}" is built into init and cannot be added separately`,
    };
  }

  let config: NormalizedProjectConfig;
  try {
    config = loadProjectConfigFromFile(projectPath);
  } catch {
    return { ok: false, message: `Could not read project config at ${projectPath}` };
  }

  if (config.modules.includes(moduleId)) {
    return { ok: false, message: `Module "${moduleId}" is already enabled in project.json` };
  }

  const updatedConfig = parseProjectConfig({
    ...config,
    modules: [...config.modules, moduleId],
  });

  const moduleDirectory = join(
    targetDir,
    "packages",
    "core",
    "src",
    moduleId,
  );
  if (existsSync(moduleDirectory) && !options.force) {
    return {
      ok: false,
      message: `Unsafe collision at ${moduleDirectory}; inspect it or rerun with --force`,
    };
  }

  const coreIndexPath = join(targetDir, "packages", "core", "src", "index.ts");
  if (
    existsSync(coreIndexPath) &&
    readFileSync(coreIndexPath, "utf-8") !== renderCoreIndex(config) &&
    !options.force
  ) {
    return {
      ok: false,
      message: `Unsafe collision at ${coreIndexPath}; preserve its exports or rerun with --force`,
    };
  }

  const matrix = loadCompatibilityMatrix();
  const compatibility = resolveCompatibility(updatedConfig, { matrix, mode: "agent" });
  if (!compatibility.ok) {
    const firstBlock = compatibility.blocks[0];
    return {
      ok: false,
      message: firstBlock?.message ?? "Module combination is not compatible",
    };
  }

  if (options.dryRun) {
    return {
      ok: true,
      module: moduleId,
      appliedRecipes: [`module-${moduleId}`],
      planned: true,
    };
  }

  const recipeResult = applyOptionalModuleRecipe(
    updatedConfig,
    targetDir,
    moduleId as "admin-catalog" | "form-wizard" | "user-identity",
  );
  if (!recipeResult.ok) {
    return {
      ok: false,
      message: `Recipe "${recipeResult.stepId}" failed: ${recipeResult.message}`,
    };
  }

  applyConfigEmit(updatedConfig, targetDir);

  return {
    ok: true,
    module: moduleId,
    appliedRecipes: recipeResult.appliedRecipes,
    planned: false,
  };
}
