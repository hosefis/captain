import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { copyTemplateTree } from "../generators/template.js";
import { templatesDir } from "../lib/paths.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";
import { resolvePackageManagerDriver } from "./package-manager.js";

const ROOT_RESERVED = new Set([
  "apps",
  "packages",
  "node_modules",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "project.json",
  "CONTEXT.md",
  ".env.example",
  ".git",
  ".gitignore",
  "turbo.json",
]);

function scopeName(scope: string): string {
  return scope.replace(/^@/, "");
}

function packageName(scope: string, suffix: string): string {
  return `${scope}/${suffix}`;
}

function adapterPackageIds(config: NormalizedProjectConfig): string[] {
  const ids: string[] = [];
  if (config.stacks.hasWeb) {
    ids.push("adapters-next");
  }
  if (config.stacks.hasMobile) {
    ids.push("adapters-expo");
  }
  if (config.stacks.hasDesktop) {
    ids.push("adapters-desktop");
  }
  return ids;
}

function appDirectory(config: NormalizedProjectConfig): string | null {
  if (config.topology === "web") {
    return "apps/web";
  }
  if (config.topology === "mobile") {
    return "apps/mobile";
  }
  return null;
}

function hoistStandaloneApp(targetDir: string, appDir: string): void {
  const appPath = join(targetDir, appDir);
  if (existsSync(appPath)) {
    return;
  }

  mkdirSync(appPath, { recursive: true });

  for (const entry of readdirSync(targetDir)) {
    if (ROOT_RESERVED.has(entry)) {
      continue;
    }

    renameSync(join(targetDir, entry), join(appPath, entry));
  }
}

function workspaceScripts(): Record<string, string> {
  return {
    dev: "turbo dev",
    build: "turbo build",
    lint: "turbo lint",
    typecheck: "turbo typecheck",
  };
}

function patchAppPackageName(appPath: string, packageName: string): void {
  const pkgPath = join(appPath, "package.json");
  if (!existsSync(pkgPath)) {
    return;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  pkg.name = packageName;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
}

function writeWorkspaceRoot(
  targetDir: string,
  config: NormalizedProjectConfig,
): void {
  const driver = resolvePackageManagerDriver(config.packageManager);
  if (driver.emitsPnpmWorkspace) {
    const workspaceYaml = `packages:\n  - "apps/*"\n  - "packages/*"\n`;
    writeFileSync(join(targetDir, "pnpm-workspace.yaml"), workspaceYaml, "utf-8");
  }

  const rootPackage = {
    name: config.name,
    private: true,
    workspaces: ["apps/*", "packages/*"],
    scripts: workspaceScripts(),
    devDependencies: {
      turbo: "^2.5.0",
    },
  };

  writeFileSync(
    join(targetDir, "package.json"),
    `${JSON.stringify(rootPackage, null, 2)}\n`,
    "utf-8",
  );
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

function ensureMonorepoWorkspaceFile(
  targetDir: string,
  config: NormalizedProjectConfig,
): void {
  if (!resolvePackageManagerDriver(config.packageManager).emitsPnpmWorkspace) {
    return;
  }
  const workspacePath = join(targetDir, "pnpm-workspace.yaml");
  if (existsSync(workspacePath)) {
    const content = readFileSync(workspacePath, "utf-8");
    if (!content.includes("packages/*")) {
      writeFileSync(
        workspacePath,
        `${content.trim()}\n  - "packages/*"\n`,
        "utf-8",
      );
    }
    return;
  }

  writeFileSync(
    workspacePath,
    `packages:\n  - "apps/*"\n  - "packages/*"\n`,
    "utf-8",
  );
}

function patchMonorepoRootPackage(
  targetDir: string,
  config: NormalizedProjectConfig,
): void {
  const packagePath = join(targetDir, "package.json");
  const current = existsSync(packagePath)
    ? (JSON.parse(readFileSync(packagePath, "utf-8")) as Record<string, unknown>)
    : {};

  writeFileSync(
    packagePath,
    `${JSON.stringify(
      {
        ...current,
        name: config.name,
        private: true,
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
}

function emitPackageSkeletons(
  targetDir: string,
  config: NormalizedProjectConfig,
): void {
  const vars = {
    scope: config.scope,
    scopeName: scopeName(config.scope),
    corePackage: packageName(config.scope, "core"),
    workspaceRange: resolvePackageManagerDriver(config.packageManager).workspaceRange,
  };

  const coreTarget = join(targetDir, "packages", "core");
  if (!existsSync(coreTarget)) {
    copyTemplateTree(join(templatesDir(), "packages", "core"), coreTarget, vars);
  }

  for (const adapterId of adapterPackageIds(config)) {
    const adapterTarget = join(targetDir, "packages", adapterId);
    if (existsSync(adapterTarget)) {
      continue;
    }
    copyTemplateTree(
      join(templatesDir(), "packages", adapterId),
      adapterTarget,
      {
        ...vars,
        adapterPackage: packageName(config.scope, adapterId),
        workspaceRange:
          resolvePackageManagerDriver(config.packageManager).workspaceRange,
      },
    );
  }
}

function reserveDesktopSlot(targetDir: string): void {
  const desktopPath = join(targetDir, "apps", "desktop");
  if (existsSync(desktopPath)) {
    return;
  }

  mkdirSync(desktopPath, { recursive: true });
  writeFileSync(
    join(desktopPath, "README.md"),
    "# Desktop app slot\n\nElectron bootstrap deferred to v1. Web UI is exported statically and wrapped here.\n",
    "utf-8",
  );
}

export function applyWorkspacePromotion(
  config: NormalizedProjectConfig,
  targetDir: string,
): void {
  const standaloneApp = appDirectory(config);

  if (standaloneApp) {
    hoistStandaloneApp(targetDir, standaloneApp);
    const appSuffix = standaloneApp.replace("apps/", "");
    patchAppPackageName(
      join(targetDir, standaloneApp),
      packageName(config.scope, appSuffix),
    );
    writeWorkspaceRoot(targetDir, config);
    writeTurboJson(targetDir);
  } else {
    ensureMonorepoWorkspaceFile(targetDir, config);
    patchMonorepoRootPackage(targetDir, config);
    writeTurboJson(targetDir);
  }

  emitPackageSkeletons(targetDir, config);

  if (config.stacks.hasDesktop) {
    reserveDesktopSlot(targetDir);
  }
}
