import { loadDocumentationVersionsManifest } from "../validators/verify-docs.js";

/** Build a compatible dependency range from the recorded validated version. */
export function testedRange(packageName: string): string {
  const version = loadDocumentationVersionsManifest().packages[packageName]?.validated;
  if (!version) {
    throw new Error(
      `No tested version is recorded for "${packageName}" in doc-versions.json`,
    );
  }
  return `^${version}`;
}
