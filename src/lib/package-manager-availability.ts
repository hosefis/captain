import { execa } from "execa";
import type { PackageManager } from "../schema/project-config.js";

export type PackageManagerAvailability = Record<PackageManager, boolean>;

const PACKAGE_MANAGERS: PackageManager[] = ["pnpm", "npm", "bun"];
const VERSION_CHECK_TIMEOUT_MILLISECONDS = 5_000;

async function isAvailable(packageManager: PackageManager): Promise<boolean> {
  try {
    const result = await execa(packageManager, ["--version"], {
      reject: false,
      stdio: "ignore",
      timeout: VERSION_CHECK_TIMEOUT_MILLISECONDS,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/** Probe supported package manager executables without installing or changing them. */
export async function detectPackageManagers(): Promise<PackageManagerAvailability> {
  const results = await Promise.all(PACKAGE_MANAGERS.map(isAvailable));
  return {
    pnpm: results[0] ?? false,
    npm: results[1] ?? false,
    bun: results[2] ?? false,
  };
}
