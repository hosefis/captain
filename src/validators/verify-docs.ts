import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { captainPackageRoot } from "../lib/paths.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";

export type DocVersionEntry = {
  validated: string;
  docs?: string;
};

export type DocVersionsManifest = {
  version: number;
  validatedAt: string;
  packages: Record<string, DocVersionEntry>;
};

export type DriftLevel = "none" | "patch" | "minor" | "major" | "unknown";

export type DocDriftEntry = {
  package: string;
  bundled: string | null;
  npmLatest: string | null;
  drift: DriftLevel;
  docs?: string;
  fetchError?: string;
};

export type VerifyDocsIssue = {
  package: string;
  message: string;
};

export type VerifyDocsResult = {
  ok: boolean;
  validatedAt: string;
  entries: DocDriftEntry[];
  blocks: VerifyDocsIssue[];
  warns: VerifyDocsIssue[];
};

export type NpmFetchResult =
  | { ok: true; version: string }
  | { ok: false; error: string };

export type NpmFetch = (packageName: string) => Promise<NpmFetchResult>;

function findDocVersionsPath(): string {
  const root = captainPackageRoot();
  const candidate = join(root, "doc-versions.json");
  if (existsSync(candidate)) {
    return candidate;
  }
  throw new Error("doc-versions.json not found");
}

export function loadDocVersionsManifest(): DocVersionsManifest {
  const raw = readFileSync(findDocVersionsPath(), "utf8");
  return JSON.parse(raw) as DocVersionsManifest;
}

export function resolvePackagesForConfig(config: NormalizedProjectConfig): string[] {
  const packages = new Set<string>();

  if (config.topology === "web" || config.stacks.hasWeb) {
    packages.add("create-next-app");
  }
  if (config.topology === "mobile" || config.stacks.hasMobile) {
    packages.add("create-expo-app");
  }
  if (config.topology === "monorepo") {
    packages.add("create-turbo");
  }

  if (config.auth === "clerk") {
    if (config.stacks.hasWeb) {
      packages.add("@clerk/nextjs");
    }
    if (config.stacks.hasMobile) {
      packages.add("@clerk/expo");
      packages.add("expo-secure-store");
    }
  }

  if (config.i18n.web === "gt-next") {
    packages.add("gt-next");
    packages.add("gtx-cli");
  }

  if (config.i18n.mobile === "gt-react-native") {
    packages.add("gt-react-native");
  }

  if (config.i18n.mobile === "gt-react-native") {
    packages.add("expo-localization");
  }

  if (config.ui.web === "shadcn-base-ui") {
    packages.add("shadcn");
  }

  if (config.ui.mobile === "nativewind") {
    packages.add("nativewind");
    packages.add("tailwindcss");
  }

  return [...packages].sort();
}

function parseSemver(version: string): { major: number; minor: number; patch: number } | null {
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

export function classifyDrift(bundled: string, npmLatest: string): DriftLevel {
  const base = parseSemver(bundled);
  const latest = parseSemver(npmLatest);
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
  entries: DocDriftEntry[],
  agentMode: boolean,
): Pick<VerifyDocsResult, "blocks" | "warns" | "ok"> {
  const blocks: VerifyDocsIssue[] = [];
  const warns: VerifyDocsIssue[] = [];

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

export async function runVerifyDocs(
  config: NormalizedProjectConfig,
  options: { agentMode: boolean; npmFetch?: NpmFetch; manifest?: DocVersionsManifest },
): Promise<VerifyDocsResult> {
  const manifest = options.manifest ?? loadDocVersionsManifest();
  const npmFetch = options.npmFetch ?? fetchNpmLatestVersion;
  const selected = resolvePackagesForConfig(config);

  const entries: DocDriftEntry[] = [];

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

export function formatVerifyDocsReport(result: VerifyDocsResult): string {
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
