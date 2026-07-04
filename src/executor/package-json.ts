import { readFileSync, writeFileSync } from "node:fs";

export type PackageJsonPatch = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

export function mergePackageJson(path: string, patch: PackageJsonPatch): void {
  const pkg = JSON.parse(readFileSync(path, "utf-8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  if (patch.dependencies) {
    pkg.dependencies = { ...pkg.dependencies, ...patch.dependencies };
  }
  if (patch.devDependencies) {
    pkg.devDependencies = { ...pkg.devDependencies, ...patch.devDependencies };
  }
  if (patch.scripts) {
    pkg.scripts = { ...pkg.scripts, ...patch.scripts };
  }

  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
}
