import { readFileSync, writeFileSync } from "node:fs";

export type PackageJsonPatch = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

/** Merge recipe dependencies and scripts into an existing package manifest. */
export function mergePackageJson(path: string, patch: PackageJsonPatch): void {
  const manifest = JSON.parse(readFileSync(path, "utf-8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  if (patch.dependencies) {
    manifest.dependencies = { ...manifest.dependencies, ...patch.dependencies };
  }
  if (patch.devDependencies) {
    manifest.devDependencies = { ...manifest.devDependencies, ...patch.devDependencies };
  }
  if (patch.peerDependencies) {
    manifest.peerDependencies = {
      ...manifest.peerDependencies,
      ...patch.peerDependencies,
    };
  }
  if (patch.scripts) {
    manifest.scripts = { ...manifest.scripts, ...patch.scripts };
  }

  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}
