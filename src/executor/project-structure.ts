import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { copyTemplateTree } from "../generators/template.js";
import { templatesDirectory } from "../lib/paths.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";
import { resolvePackageManagerDriver } from "./package-manager.js";

const PNPM_ONLY_BUILT_DEPENDENCIES = [
  "@clerk/shared",
  "esbuild",
  "msw",
  "sharp",
  "unrs-resolver",
];
const ESLINT_COMPATIBLE_TYPESCRIPT_VERSION = "5.9.3";
const EXPO_COMPATIBLE_BABEL_VERSION = "7.29.7";

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

function ensurePnpmWorkspace(targetDirectory: string): void {
  const workspacePath = join(targetDirectory, "pnpm-workspace.yaml");
  writeFileSync(workspacePath, pnpmWorkspaceYaml(), "utf-8");
}

function ensureStandalonePnpmConfiguration(targetDirectory: string): void {
  const workspacePath = join(targetDirectory, "pnpm-workspace.yaml");
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

function writeTurboJson(targetDirectory: string): void {
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
    join(targetDirectory, "turbo.json"),
    `${JSON.stringify(turbo, null, 2)}\n`,
    "utf-8",
  );
}

function patchMonorepoRoot(
  targetDirectory: string,
  configuration: NormalizedProjectConfig,
): void {
  const packagePath = join(targetDirectory, "package.json");
  const current = existsSync(packagePath)
    ? (JSON.parse(readFileSync(packagePath, "utf-8")) as Record<string, unknown>)
    : {};
  const driver = resolvePackageManagerDriver(configuration.packageManager);

  writeFileSync(
    packagePath,
    `${JSON.stringify(
      {
        ...current,
        name: configuration.name,
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
          typescript: ESLINT_COMPATIBLE_TYPESCRIPT_VERSION,
          ...(configuration.apps.includes("mobile") ? { "@babel/core": EXPO_COMPATIBLE_BABEL_VERSION } : {}),
        },
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  if (driver.emitsPnpmWorkspace) {
    ensurePnpmWorkspace(targetDirectory);
  }
  writeTurboJson(targetDirectory);
}

function emitPackageSkeletons(
  targetDirectory: string,
  configuration: NormalizedProjectConfig,
): void {
  const scopeName = configuration.scope.replace(/^@/, "");
  const workspaceRange =
    resolvePackageManagerDriver(configuration.packageManager).workspaceRange;
  const variables = {
    scope: configuration.scope,
    scopeName,
    corePackage: `${configuration.scope}/core`,
    workspaceRange,
  };

  const packages = ["core", "adapters-next", "adapters-expo"] as const;
  for (const packageId of packages) {
    const target = join(targetDirectory, "packages", packageId);
    if (existsSync(target)) {
      continue;
    }
    copyTemplateTree(
      join(templatesDirectory(), "packages", packageId),
      target,
      packageId === "core"
        ? variables
        : {
            ...variables,
            adapterPackage: `${configuration.scope}/${packageId}`,
          },
    );
  }
}

/** Keep starter compilers compatible with Next's ESLint toolchain. */
function pinMonorepoTypescript(targetDirectory: string): void {
  for (const workspace of ["apps", "packages"]) {
    const workspaceDirectory = join(targetDirectory, workspace);
    if (!existsSync(workspaceDirectory)) continue;

    for (const entry of readdirSync(workspaceDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packagePath = join(workspaceDirectory, entry.name, "package.json");
      if (!existsSync(packagePath)) continue;
      const manifest = JSON.parse(readFileSync(packagePath, "utf-8")) as {
        devDependencies?: Record<string, string>;
      };
      const current = manifest.devDependencies?.typescript;
      if (typeof current !== "string" || !/^[~^]?7\./.test(current)) continue;
      manifest.devDependencies!.typescript = ESLINT_COMPATIBLE_TYPESCRIPT_VERSION;
      writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
    }
  }
}

function patchMonorepoEslintConfiguration(targetDirectory: string): void {
  const configurationPath = join(targetDirectory, "packages", "eslint-config", "base.js");
  if (!existsSync(configurationPath)) return;

  const source = readFileSync(configurationPath, "utf-8");
  const preset = 'presets: ["@babel/preset-typescript"]';
  if (!source.includes(preset)) return;

  const patched = source.replace(
    preset,
    'presets: [createRequire(import.meta.url).resolve("@babel/preset-typescript")]',
  );
  writeFileSync(
    configurationPath,
    `import { createRequire } from "node:module";\n${patched}`,
    "utf-8",
  );
}

function createStandaloneDirectories(
  targetDirectory: string,
  configuration: NormalizedProjectConfig,
): void {
  for (const directory of [
    "src/app",
    "src/components",
    "src/features",
    "src/lib",
    "src/integrations",
  ]) {
    mkdirSync(join(targetDirectory, directory), { recursive: true });
  }

  const packagePath = join(targetDirectory, "package.json");
  const current = JSON.parse(readFileSync(packagePath, "utf-8")) as {
    scripts?: Record<string, string>;
    [key: string]: unknown;
  };
  const scripts = {
    ...(current.scripts ?? {}),
    typecheck: "tsc --noEmit",
    ...(configuration.topology === "mobile"
      ? { build: "expo export", lint: current.scripts?.lint ?? "expo lint" }
      : {}),
  };
  writeFileSync(
    packagePath,
    `${JSON.stringify(
      {
        ...current,
        name: configuration.name,
        packageManager:
          resolvePackageManagerDriver(configuration.packageManager).manifestId,
        scripts,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );

  if (configuration.packageManager === "pnpm") {
    ensureStandalonePnpmConfiguration(targetDirectory);
  }
}

/** Configure framework workspaces and create the selected project directory structure. */
export function applyProjectStructure(
  configuration: NormalizedProjectConfig,
  targetDirectory: string,
): void {
  if (configuration.topology !== "monorepo") {
    createStandaloneDirectories(targetDirectory, configuration);
    return;
  }

  patchMonorepoRoot(targetDirectory, configuration);
  patchMonorepoEslintConfiguration(targetDirectory);
  emitPackageSkeletons(targetDirectory, configuration);
  pinMonorepoTypescript(targetDirectory);
  for (const app of configuration.apps) {
    if (configuration.packageManager === "pnpm") {
      const nestedWorkspacePath = join(targetDirectory, "apps", app, "pnpm-workspace.yaml");
      if (existsSync(nestedWorkspacePath)) {
        unlinkSync(nestedWorkspacePath);
      }
    }
    const packagePath = join(targetDirectory, "apps", app, "package.json");
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
