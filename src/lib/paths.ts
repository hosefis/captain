import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Package root (parent of dist/ when bundled, or repo root in tests). */
export function captainPackageRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, "/");
  if (moduleDirectory.endsWith("/dist")) {
    return join(moduleDirectory, "..");
  }
  return join(moduleDirectory, "../..");
}

/** Locate the templates shipped beside the Captain executable. */
export function templatesDirectory(): string {
  return join(captainPackageRoot(), "templates");
}
