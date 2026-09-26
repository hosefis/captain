import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { copyTemplateTree } from "../generators/template.js";
import { templatesDir } from "../lib/paths.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";
import { resolvePackageManagerDriver } from "./package-manager.js";

const PNPM_ONLY_BUILT_DEPENDENCIES = [
  "@clerk/shared",
  "esbuild",
  "msw",
  "sharp",
  "unrs-resolver",
];

function workspaceScripts(): Record<string, string> {
  return {
    dev: "turbo dev",
    build: "turbo build",
    lint: "turbo lint",
    typecheck: "turbo typecheck",
  };
}

function pnpmWorkspaceYaml(): string {
  return [
    "packages:",
    '  - "apps/*"',
    '  - "packages/*"',
    "allowBuilds:",
    ...PNPM_ONLY_BUILT_DEPENDENCIES.map(
      (dependency) => `  "${dependency}": true`,
    ),
    "onlyBuiltDependencies:",
    ...PNPM_ONLY_BUILT_DEPENDENCIES.map((dependency) => `  - "${dependency}"`),
    "",
  ].join("\n");
}

function ensurePnpmWorkspace(targetDir: string): void {
  const workspacePath = join(targetDir, "pnpm-workspace.yaml");
  writeFileSync(workspacePath, pnpmWorkspaceYaml(), "utf-8");
}

function ensureStandalonePnpmConfig(targetDir: string): void {
  const workspacePath = join(targetDir, "pnpm-workspace.yaml");
  if (!existsSync(workspacePath)) {
    writeFileSync(workspacePath, 'packages:\n  - "."\n', "utf-8");
    return;
  }

  const current = readFileSync(workspacePath, "utf-8");
  if (/^packages\s*:/m.test(current)) {
    return;
  }

  writeFileSync(
    workspacePath,
    `packages:\n  - "."\n\n${current}`,
    "utf-8",
  );
}

function writeTurboJson(targetDir: string): void {
  const turbo = {
    $schema: "https://turbo.build/schema.json",
    tasks: {
      build: {
        dependsOn: ["^build"],
        outputs: [".next/**", "!.next/cache/**", "dist/**"],
      },
      lint: { dependsOn: ["^lint"] },
      typecheck: { dependsOn: ["^typecheck"] },
      dev: { cache: false, persistent: true },
    },
  };
  writeFileSync(
    join(targetDir, "turbo.json"),
    `${JSON.stringify(turbo, null, 2)}\n`,
    "utf-8",
  );
}

function patchMonorepoRoot(
  targetDir: string,
  config: NormalizedProjectConfig,
): void {
  const packagePath = join(targetDir, "package.json");
  const current = existsSync(packagePath)
    ? (JSON.parse(readFileSync(packagePath, "utf-8")) as Record<string, unknown>)
    : {};
  const driver = resolvePackageManagerDriver(config.packageManager);

  writeFileSync(
    packagePath,
    `${JSON.stringify(
      {
        ...current,
        name: config.name,
        private: true,
        packageManager: driver.manifestId,
        workspaces: ["apps/*", "packages/*"],
        scripts: {
          ...((current.scripts as Record<string, string> | undefined) ?? {}),
          ...workspaceScripts(),
        },
        devDependencies: {
          ...((current.devDependencies as Record<string, string> | undefined) ?? {}),
          turbo: "^2.5.0",
        },
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  if (driver.emitsPnpmWorkspace) {
    ensurePnpmWorkspace(targetDir);
  }
  writeTurboJson(targetDir);
}

function emitPackageSkeletons(
  targetDir: string,
  config: NormalizedProjectConfig,
): void {
  const scopeName = config.scope.replace(/^@/, "");
  const workspaceRange =
    resolvePackageManagerDriver(config.packageManager).workspaceRange;
  const vars = {
    scope: config.scope,
    scopeName,
    corePackage: `${config.scope}/core`,
    workspaceRange,
  };

  const packages = ["core", "adapters-next", "adapters-expo"] as const;
  for (const packageId of packages) {
    const target = join(targetDir, "packages", packageId);
    if (existsSync(target)) {
      continue;
    }
    copyTemplateTree(
      join(templatesDir(), "packages", packageId),
      target,
      packageId === "core"
        ? vars
        : {
            ...vars,
            adapterPackage: `${config.scope}/${packageId}`,
          },
    );
  }
}

function createStandaloneDirectories(
  targetDir: string,
  config: NormalizedProjectConfig,
): void {
  for (const directory of [
    "src/app",
    "src/components",
    "src/features",
    "src/lib",
    "src/integrations",
  ]) {
    mkdirSync(join(targetDir, directory), { recursive: true });
  }

  const packagePath = join(targetDir, "package.json");
  const current = JSON.parse(readFileSync(packagePath, "utf-8")) as {
    scripts?: Record<string, string>;
    [key: string]: unknown;
  };
  const scripts = {
    ...(current.scripts ?? {}),
    typecheck: "tsc --noEmit",
    ...(config.topology === "mobile"
      ? { build: "expo export", lint: current.scripts?.lint ?? "expo lint" }
      : {}),
  };
  writeFileSync(
    packagePath,
    `${JSON.stringify(
      {
        ...current,
        name: config.name,
        packageManager:
          resolvePackageManagerDriver(config.packageManager).manifestId,
        scripts,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  if (config.packageManager === "pnpm") {
    ensureStandalonePnpmConfig(targetDir);
  }
}

export function applyProjectStructure(
  config: NormalizedProjectConfig,
  targetDir: string,
): void {
  if (config.topology !== "monorepo") {
    createStandaloneDirectories(targetDir, config);
    return;
  }

  patchMonorepoRoot(targetDir, config);
  emitPackageSkeletons(targetDir, config);
  for (const app of config.apps) {
    if (config.packageManager === "pnpm") {
      const nestedWorkspacePath = join(targetDir, "apps", app, "pnpm-workspace.yaml");
      if (existsSync(nestedWorkspacePath)) {
        unlinkSync(nestedWorkspacePath);
      }
    }
    const packagePath = join(targetDir, "apps", app, "package.json");
    if (!existsSync(packagePath)) {
      continue;
    }
    const manifest = JSON.parse(readFileSync(packagePath, "utf-8")) as {
      scripts?: Record<string, string>;
      [key: string]: unknown;
    };
    delete manifest.packageManager;
    writeFileSync(
      packagePath,
      `${JSON.stringify({
        ...manifest,
        scripts: {
          ...manifest.scripts,
          typecheck: "tsc --noEmit",
          ...(app === "mobile" ? { build: "expo export" } : {}),
        },
      }, null, 2)}\n`,
    );
  }
}
