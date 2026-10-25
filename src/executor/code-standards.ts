import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { captainPackageRoot } from "../lib/paths.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";

function extendLint(packagePath: string, checkerPath: string, isRootPackage: boolean): void {
  const manifest = JSON.parse(readFileSync(packagePath, "utf-8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const command = `node ${checkerPath} .`;
  const previous = manifest.scripts?.lint;
  manifest.scripts = {
    ...manifest.scripts,
    lint: previous && !previous.includes(command) ? `${previous} && ${command}` : previous ?? command,
  };
  if (isRootPackage) {
    const version = manifest.devDependencies?.typescript ?? manifest.dependencies?.typescript;
    const minimum = version?.match(/^[~^]?(\d+)\.(\d+)(?:\.|$)/);
    const compatible = minimum?.[1] === "6" || (minimum?.[1] === "5" && Number(minimum[2]) >= 8);
    manifest.devDependencies = {
      ...manifest.devDependencies,
      typescript: compatible ? version! : "^5.8.2",
    };
  }
  writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

/** Installs package-owned tooling and preserves each framework's existing lint checks. */
export function applyCodeStandards(config: NormalizedProjectConfig, targetDirectory: string): void {
  if (!config.enforceCodeStandards) return;

  const toolsDirectory = join(targetDirectory, "tools");
  mkdirSync(toolsDirectory, { recursive: true });
  copyFileSync(
    join(captainPackageRoot(), "scripts", "check-code-standards.mjs"),
    join(toolsDirectory, "check-code-standards.mjs"),
  );
  extendLint(join(targetDirectory, "package.json"), "tools/check-code-standards.mjs", true);
  if (config.topology !== "monorepo") return;

  for (const workspace of ["apps", "packages"]) {
    const directory = join(targetDirectory, workspace);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packagePath = join(directory, entry.name, "package.json");
      if (existsSync(packagePath)) {
        extendLint(packagePath, "../../tools/check-code-standards.mjs", false);
      }
    }
  }
}
