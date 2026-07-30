import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Package root (parent of dist/ when bundled, or repo root in tests). */
export function captainPackageRoot(): string {
  const cliDir = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, "/");
  if (cliDir.endsWith("/dist")) {
    return join(cliDir, "..");
  }
  return join(cliDir, "../..");
}

export function templatesDir(): string {
  return join(captainPackageRoot(), "templates");
}
