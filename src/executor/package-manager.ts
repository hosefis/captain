import type { PackageManager } from "../schema/project-config.js";

export type PackageManagerCommand = {
  command: string;
  args: string[];
};

export type PackageManagerDriver = {
  id: PackageManager;
  install: PackageManagerCommand;
  lockfile: string;
  workspaceRange: string;
  emitsPnpmWorkspace: boolean;
  runScript(script: string): PackageManagerCommand;
};

const DRIVERS: Record<PackageManager, PackageManagerDriver> = {
  pnpm: {
    id: "pnpm",
    install: { command: "pnpm", args: ["install"] },
    lockfile: "pnpm-lock.yaml",
    workspaceRange: "workspace:*",
    emitsPnpmWorkspace: true,
    runScript: (script) => ({ command: "pnpm", args: ["run", script] }),
  },
  npm: {
    id: "npm",
    install: { command: "npm", args: ["install"] },
    lockfile: "package-lock.json",
    workspaceRange: "*",
    emitsPnpmWorkspace: false,
    runScript: (script) => ({ command: "npm", args: ["run", script] }),
  },
  bun: {
    id: "bun",
    install: { command: "bun", args: ["install"] },
    lockfile: "bun.lock",
    workspaceRange: "workspace:*",
    emitsPnpmWorkspace: false,
    runScript: (script) => ({ command: "bun", args: ["run", script] }),
  },
};

export function resolvePackageManagerDriver(
  packageManager: PackageManager,
): PackageManagerDriver {
  return DRIVERS[packageManager];
}
