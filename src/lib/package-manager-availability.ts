import { execa } from "execa";
import type { PackageManager } from "../schema/project-config.js";

export type PackageManagerAvailability = Record<PackageManager, boolean>;

const PACKAGE_MANAGERS: PackageManager[] = ["pnpm", "npm", "bun"];

async function isAvailable(packageManager: PackageManager): Promise<boolean> {
  try {
    const result = await execa(packageManager, ["--version"], {
      reject: false,
      stdio: "ignore",
      timeout: 5_000,
    });
    return result.exitCode === 0;
  } catch {
    // A missing executable or a timed-out version check is unavailable.
    return false;
  }
}

export async function detectPackageManagers(): Promise<PackageManagerAvailability> {
  const results = await Promise.all(PACKAGE_MANAGERS.map(isAvailable));
  return {
    pnpm: results[0] ?? false,
    npm: results[1] ?? false,
    bun: results[2] ?? false,
  };
}
