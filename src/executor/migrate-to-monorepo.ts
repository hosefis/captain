import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyAddedAppRecipes } from "./apply-recipes.js";
import { applyConfigEmit } from "./config-emit.js";
import { applyWorkspacePromotion } from "./workspace-promote.js";
import { loadCompatibilityMatrix, resolveCompatibility } from "../resolver/compatibility.js";
import type { App, NormalizedI18n, NormalizedProjectConfig, NormalizedUi } from "../schema/project-config.js";
import {
  loadProjectConfigFromFile,
  parseProjectConfig,
} from "../schema/project-config.js";
import { resolveBootstrapPlan } from "../resolver/bootstrap.js";
import {
  runBootstrapPlan,
  type BootstrapRunner,
} from "./bootstrap-run.js";
import { resolvePackageManagerDriver } from "./package-manager.js";

export type MigrateToMonorepoResult =
  | {
      ok: true;
      config: NormalizedProjectConfig;
      addedApps: App[];
      planned: boolean;
    }
  | { ok: false; message: string };

function defaultMobileI18n(config: NormalizedProjectConfig): NormalizedI18n {
  return {
    web: config.i18n.web,
    mobile: config.i18n.mobile ?? "gt-react-native",
  };
}

function defaultMobileUi(config: NormalizedProjectConfig): NormalizedUi {
  return {
    web: config.ui.web,
    mobile: config.ui.mobile ?? "nativewind",
  };
}

function writeMonorepoRootScripts(targetDir: string): void {
  const rootPkgPath = join(targetDir, "package.json");
  if (!existsSync(rootPkgPath)) {
    return;
  }

  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8")) as {
    scripts?: Record<string, string>;
  };

  rootPkg.scripts = {
    dev: "turbo dev",
    build: "turbo build",
    lint: "turbo lint",
    typecheck: "turbo typecheck",
    ...(rootPkg.scripts?.["i18n:check"] ? { "i18n:check": rootPkg.scripts["i18n:check"] } : {}),
  };

  writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`, "utf-8");
}

function writeTurboJson(targetDir: string): void {
  if (existsSync(join(targetDir, "turbo.json"))) {
    return;
  }

  const turbo = {
    $schema: "https://turbo.build/schema.json",
    tasks: {
      build: { dependsOn: ["^build"], outputs: [".next/**", "!.next/cache/**", "dist/**"] },
      lint: { dependsOn: ["^lint"] },
      typecheck: { dependsOn: ["^typecheck"] },
      dev: { cache: false, persistent: true },
    },
  };

  writeFileSync(join(targetDir, "turbo.json"), `${JSON.stringify(turbo, null, 2)}\n`, "utf-8");
}

export async function migrateToMonorepo(options: {
  targetDir: string;
  projectPath?: string;
  addApp?: App;
  force?: boolean;
  dryRun?: boolean;
  bootstrapRunner?: BootstrapRunner;
}): Promise<MigrateToMonorepoResult> {
  const targetDir = resolve(options.targetDir);
  const projectPath = resolve(targetDir, options.projectPath ?? "project.json");

  let config: NormalizedProjectConfig;
  try {
    config = loadProjectConfigFromFile(projectPath);
  } catch {
    return { ok: false, message: `Could not read project config at ${projectPath}` };
  }

  if (config.topology === "monorepo") {
    return { ok: false, message: "Project is already a monorepo (topology: monorepo)" };
  }

  const existingApp = config.topology === "web" ? "web" : "mobile";
  const apps: App[] = [existingApp];
  const addedApps: App[] = [];

  if (options.addApp) {
    if (options.addApp === existingApp) {
      return {
        ok: false,
        message: `App "${options.addApp}" already exists in this ${config.topology} project`,
      };
    }
    if (!apps.includes(options.addApp)) {
      apps.push(options.addApp);
      addedApps.push(options.addApp);
    }
  }

  if (options.addApp) {
    const addedPath = join(targetDir, "apps", options.addApp);
    if (existsSync(addedPath) && !options.force) {
      return {
        ok: false,
        message: `Unsafe app collision at ${addedPath}; inspect it or rerun with --force`,
      };
    }
  }

  let nextConfig = parseProjectConfig({
    ...config,
    topology: "monorepo",
    apps,
    runtime:
      config.runtime ??
      (apps.includes("mobile") ? ("dev-build" as const) : undefined),
    i18n: apps.includes("mobile") ? defaultMobileI18n(config) : config.i18n,
    ui: apps.includes("mobile") ? defaultMobileUi(config) : config.ui,
  });

  const matrix = loadCompatibilityMatrix();
  const compatibility = resolveCompatibility(nextConfig, { matrix, mode: "agent" });
  if (!compatibility.ok) {
    const firstBlock = compatibility.blocks[0];
    return {
      ok: false,
      message: firstBlock?.message ?? "Monorepo migration config is not compatible",
    };
  }

  if (options.dryRun) {
    return { ok: true, config: nextConfig, addedApps, planned: true };
  }

  if (options.addApp === "web" || options.addApp === "mobile") {
    const stepId = `bootstrap-apps-${options.addApp}`;
    const steps = resolveBootstrapPlan(nextConfig, targetDir).filter(
      (step) => step.id === stepId,
    );
    const bootstrap = await runBootstrapPlan(steps, {
      runner: options.bootstrapRunner,
    });
    if (!bootstrap.ok) {
      return {
        ok: false,
        message: `Could not bootstrap ${options.addApp}: ${bootstrap.stderr}`,
      };
    }

    const appPath = join(targetDir, "apps", options.addApp);
    if (!existsSync(join(appPath, "package.json"))) {
      mkdirSync(appPath, { recursive: true });
      writeFileSync(
        join(appPath, "package.json"),
        `${JSON.stringify(
          {
            name: `${nextConfig.scope}/${options.addApp}`,
            scripts:
              options.addApp === "web"
                ? {
                    dev: "next dev",
                    build: "next build",
                    lint: "eslint .",
                    typecheck: "tsc --noEmit",
                  }
                : {
                    start: "expo start",
                    build: "expo export",
                    lint: "eslint .",
                    typecheck: "tsc --noEmit",
                  },
          },
          null,
          2,
        )}\n`,
      );
    }
  }

  if (
    resolvePackageManagerDriver(nextConfig.packageManager).emitsPnpmWorkspace
  ) {
    writeFileSync(
      join(targetDir, "pnpm-workspace.yaml"),
      `packages:\n  - "apps/*"\n  - "packages/*"\n`,
      "utf-8",
    );
  }
  writeTurboJson(targetDir);
  writeMonorepoRootScripts(targetDir);

  applyWorkspacePromotion(nextConfig, targetDir);

  if (options.addApp === "web" || options.addApp === "mobile") {
    const recipeResult = applyAddedAppRecipes(
      nextConfig,
      targetDir,
      options.addApp,
    );
    if (!recipeResult.ok) {
      return {
        ok: false,
        message: `Recipe "${recipeResult.stepId}" failed: ${recipeResult.message}`,
      };
    }
  }

  applyConfigEmit(nextConfig, targetDir);

  return { ok: true, config: nextConfig, addedApps, planned: false };
}
