import type { PackageManager } from "../schema/project-config.js";

export type PackageManagerCommand = {
  command: string;
  commandArguments: string[];
};

export type PackageManagerDriver = {
  id: PackageManager;
  install: PackageManagerCommand;
  lockfile: string;
  workspaceRange: string;
  emitsPnpmWorkspace: boolean;
  manifestId: string;
  /** Build the package manager command that runs a named package script. */
  runScript(script: string): PackageManagerCommand;
};

const DRIVERS: Record<PackageManager, PackageManagerDriver> = {
  pnpm: {
    id: "pnpm",
    install: {
      command: "pnpm",
      commandArguments: ["install", "--no-frozen-lockfile", "--force"],
    },
    lockfile: "pnpm-lock.yaml",
    workspaceRange: "workspace:*",
    emitsPnpmWorkspace: true,
    manifestId: "pnpm@9.15.9",
    runScript: (script) => ({ command: "pnpm", commandArguments: ["run", script] }),
  },
  npm: {
    id: "npm",
    install: { command: "npm", commandArguments: ["install"] },
    lockfile: "package-lock.json",
    workspaceRange: "*",
    emitsPnpmWorkspace: false,
    manifestId: "npm@10.9.2",
    runScript: (script) => ({ command: "npm", commandArguments: ["run", script] }),
  },
  bun: {
    id: "bun",
    install: { command: "bun", commandArguments: ["install"] },
    lockfile: "bun.lock",
    workspaceRange: "workspace:*",
    emitsPnpmWorkspace: false,
    manifestId: "bun@1.2.5",
    runScript: (script) => ({ command: "bun", commandArguments: ["run", script] }),
  },
};

/** Return installation and workspace conventions for the selected package manager. */
export function resolvePackageManagerDriver(
  packageManager: PackageManager,
): PackageManagerDriver {
  return DRIVERS[packageManager];
}
