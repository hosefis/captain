import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { captainPackageRoot } from "../lib/paths.js";
import type { NormalizedProjectConfiguration } from "../schema/project-configuration.js";

export type DocumentationVersionEntry = {
  validated: string;
  docs?: string;
};

export type DocumentationVersionsManifest = {
  version: number;
  validatedAt: string;
  packages: Record<string, DocumentationVersionEntry>;
};

export type DriftLevel = "none" | "patch" | "minor" | "major" | "unknown";

export type DocumentationDriftEntry = {
  package: string;
  bundled: string | null;
  npmLatest: string | null;
  drift: DriftLevel;
  docs?: string;
  fetchError?: string;
};

export type DocumentationVerificationIssue = {
  package: string;
  message: string;
};

export type DocumentationVerificationResult = {
  ok: boolean;
  validatedAt: string;
  entries: DocumentationDriftEntry[];
  blocks: DocumentationVerificationIssue[];
  warns: DocumentationVerificationIssue[];
};

export type NpmFetchResult =
  | { ok: true; version: string }
  | { ok: false; error: string };

/** Retrieve a package's latest registry version without changing project dependencies. */
export type NpmFetch = (packageName: string) => Promise<NpmFetchResult>;

function findDocumentationVersionsPath(): string {
  const root = captainPackageRoot();
  const candidate = join(root, "doc-versions.json");
  if (existsSync(candidate)) {
    return candidate;
  }
  throw new Error("doc-versions.json not found");
}

/** Load the dependency versions validated against the bundled recipes. */
export function loadDocumentationVersionsManifest(): DocumentationVersionsManifest {
  const raw = readFileSync(findDocumentationVersionsPath(), "utf8");
  return JSON.parse(raw) as DocumentationVersionsManifest;
}

/** List registry packages used by the selected framework and integrations. */
export function resolvePackagesForConfiguration(configuration: NormalizedProjectConfiguration): string[] {
  const packages = new Set<string>();

  if (configuration.topology === "web" || configuration.stacks.hasWeb) {
    packages.add("create-next-app");
  }
  if (configuration.topology === "mobile" || configuration.stacks.hasMobile) {
    packages.add("create-expo-app");
  }
  if (configuration.topology === "monorepo") {
    packages.add("create-turbo");
  }

  if (configuration.backend === "convex") {
    packages.add("convex");
  }

  if (configuration.auth === "clerk") {
    if (configuration.stacks.hasWeb) {
      packages.add("@clerk/nextjs");
    }
    if (configuration.stacks.hasMobile) {
      packages.add("@clerk/expo");
      packages.add("expo-secure-store");
      packages.add("expo-auth-session");
      packages.add("expo-crypto");
    }
  }

  if (configuration.i18n.web === "gt-next") {
    packages.add("gt-next");
    packages.add("gtx-cli");
  }

  if (configuration.i18n.mobile === "gt-react-native") {
    packages.add("gt-react-native");
  }

  if (configuration.i18n.mobile === "gt-react-native") {
    packages.add("expo-localization");
  }

  if (configuration.ui.web === "shadcn-base-ui") {
    packages.add("shadcn");
  }

  if (configuration.ui.mobile === "nativewind") {
    packages.add("nativewind");
    packages.add("react-native-css-interop");
    packages.add("tailwindcss");
    packages.add("eslint");
    packages.add("eslint-config-expo");
    packages.add("babel-preset-expo");
    packages.add("@babel/core");
    packages.add("@babel/plugin-transform-react-jsx");
    packages.add("@babel/plugin-transform-react-jsx-development");
    packages.add("@babel/types");
  }

  return [...packages].sort();
}

function parseSemanticVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/** Classify how far a registry version has advanced beyond the validated baseline. */
export function classifyDrift(bundled: string, npmLatest: string): DriftLevel {
  const base = parseSemanticVersion(bundled);
  const latest = parseSemanticVersion(npmLatest);
  if (!base || !latest) {
    return bundled === npmLatest ? "none" : "unknown";
  }
  if (latest.major > base.major) {
    return "major";
  }
  if (latest.major < base.major) {
    return "none";
  }
  if (latest.minor > base.minor) {
    return "minor";
  }
  if (latest.minor < base.minor) {
    return "none";
  }
  if (latest.patch > base.patch) {
    return "patch";
  }
  return "none";
}

/** Fetch the npm latest version and return registry or transport failures as data. */
export async function fetchNpmLatestVersion(packageName: string): Promise<NpmFetchResult> {
  const encoded = packageName.replace("/", "%2F");
  const url = `https://registry.npmjs.org/${encoded}/latest`;

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return { ok: false, error: `npm registry HTTP ${response.status}` };
    }
    const data = (await response.json()) as { version?: string };
    if (!data.version) {
      return { ok: false, error: "npm registry response missing version" };
    }
    return { ok: true, version: data.version };
  } catch (error) {
    const message = error instanceof Error ? error.message : "npm registry fetch failed";
    return { ok: false, error: message };
  }
}

function buildIssues(
  entries: DocumentationDriftEntry[],
  agentMode: boolean,
): Pick<DocumentationVerificationResult, "blocks" | "warns" | "ok"> {
  const blocks: DocumentationVerificationIssue[] = [];
  const warns: DocumentationVerificationIssue[] = [];

  for (const entry of entries) {
    if (entry.fetchError) {
      const message = `Could not fetch npm latest for ${entry.package}: ${entry.fetchError}`;
      if (agentMode) {
        blocks.push({ package: entry.package, message });
      } else {
        warns.push({ package: entry.package, message });
      }
      continue;
    }

    if (!entry.bundled) {
      warns.push({
        package: entry.package,
        message: `${entry.package} has no bundled baseline in doc-versions.json`,
      });
      continue;
    }

    if (entry.drift === "major") {
      const message = `${entry.package}: npm latest ${entry.npmLatest} is a major bump over bundled ${entry.bundled}`;
      if (agentMode) {
        blocks.push({ package: entry.package, message });
      } else {
        warns.push({ package: entry.package, message });
      }
      continue;
    }

    if (entry.drift === "minor" || entry.drift === "patch" || entry.drift === "unknown") {
      warns.push({
        package: entry.package,
        message: `${entry.package}: npm latest ${entry.npmLatest} differs from bundled ${entry.bundled} (${entry.drift} drift)`,
      });
    }
  }

  return { blocks, warns, ok: blocks.length === 0 };
}

/** Compare selected dependencies with npm and apply execution-mode drift policy. */
export async function verifyDocumentationVersions(
  configuration: NormalizedProjectConfiguration,
  options: { agentMode: boolean; npmFetch?: NpmFetch; manifest?: DocumentationVersionsManifest },
): Promise<DocumentationVerificationResult> {
  const manifest = options.manifest ?? loadDocumentationVersionsManifest();
  const npmFetch = options.npmFetch ?? fetchNpmLatestVersion;
  const selected = resolvePackagesForConfiguration(configuration);

  const entries: DocumentationDriftEntry[] = [];

  for (const packageName of selected) {
    const baseline = manifest.packages[packageName];
    const fetchResult = await npmFetch(packageName);

    if (!fetchResult.ok) {
      entries.push({
        package: packageName,
        bundled: baseline?.validated ?? null,
        npmLatest: null,
        drift: "unknown",
        docs: baseline?.docs,
        fetchError: fetchResult.error,
      });
      continue;
    }

    const bundled = baseline?.validated ?? null;
    const drift =
      bundled === null ? "unknown" : classifyDrift(bundled, fetchResult.version);

    entries.push({
      package: packageName,
      bundled,
      npmLatest: fetchResult.version,
      drift,
      docs: baseline?.docs,
    });
  }

  const issues = buildIssues(entries, options.agentMode);

  return {
    validatedAt: manifest.validatedAt,
    entries,
    ...issues,
  };
}

/** Render dependency baselines, drift, and blocking or advisory diagnostics. */
export function formatDocumentationVersionReport(result: DocumentationVerificationResult): string {
  const lines = [
    `Doc version drift report (bundled baseline: ${result.validatedAt})`,
    "",
  ];

  for (const entry of result.entries) {
    const status =
      entry.fetchError !== undefined
        ? "fetch failed"
        : entry.drift === "none"
          ? "ok"
          : entry.drift;
    lines.push(
      `  ${entry.package}: bundled=${entry.bundled ?? "—"} npm=${entry.npmLatest ?? "—"} [${status}]`,
    );
    if (entry.docs) {
      lines.push(`    docs: ${entry.docs}`);
    }
  }

  if (result.blocks.length > 0) {
    lines.push("", "Blocks:");
    for (const block of result.blocks) {
      lines.push(`  • ${block.message}`);
    }
  }

  if (result.warns.length > 0) {
    lines.push("", "Warnings:");
    for (const warn of result.warns) {
      lines.push(`  • ${warn.message}`);
    }
  }

  return lines.join("\n");
}
