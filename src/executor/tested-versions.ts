import { loadDocVersionsManifest } from "../validators/verify-docs.js";

export function testedRange(packageName: string): string {
  const version = loadDocVersionsManifest().packages[packageName]?.validated;
  if (!version) {
    throw new Error(
      `No tested version is recorded for "${packageName}" in doc-versions.json`,
    );
  }
  return `^${version}`;
}
