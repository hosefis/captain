import { describe, expect, it } from "vitest";
import type { NormalizedProjectConfig } from "../schema/project-config.js";
import {
  classifyDrift,
  formatVerifyDocsReport,
  resolvePackagesForConfig,
  runVerifyDocs,
  type DocVersionsManifest,
  type NpmFetch,
} from "./verify-docs.js";

const tierAWebConfig: NormalizedProjectConfig = {
  name: "acme-web",
  scope: "@acme",
  packageManager: "pnpm",
  topology: "web",
  apps: ["web"],
  backend: "rest",
  auth: "clerk",
  i18n: { web: "gt-next" },
  ui: { web: "shadcn-base-ui" },
  locales: ["en", "fr"],
  defaultLocale: "en",
  stacks: { hasWeb: true, hasMobile: false },
};

const testManifest: DocVersionsManifest = {
  version: 1,
  validatedAt: "2026-07-01",
  packages: {
    "create-next-app": { validated: "15.0.0", docs: "https://example.com/next" },
    "@clerk/nextjs": { validated: "6.0.0" },
    "gt-next": { validated: "1.0.0" },
    "gtx-cli": { validated: "1.0.0" },
    shadcn: { validated: "2.0.0" },
  },
};

function mockNpmFetch(versions: Record<string, string>): NpmFetch {
  return async (packageName) => {
    const version = versions[packageName];
    if (!version) {
      return { ok: false, error: "not found" };
    }
    return { ok: true, version };
  };
}

describe("resolvePackagesForConfig", () => {
  it("resolves Tier A web packages", () => {
    expect(resolvePackagesForConfig(tierAWebConfig)).toEqual([
      "@clerk/nextjs",
      "create-next-app",
      "gt-next",
      "gtx-cli",
      "shadcn",
    ]);
  });

  it("includes expo bootstrap and mobile adapters for monorepo mobile", () => {
    const packages = resolvePackagesForConfig({
      ...tierAWebConfig,
      topology: "monorepo",
      apps: ["web", "mobile"],
      i18n: { web: "gt-next", mobile: "gt-react-native" },
      ui: { web: "shadcn-base-ui", mobile: "nativewind" },
      stacks: { hasWeb: true, hasMobile: true },
    });

    expect(packages).toContain("create-turbo");
    expect(packages).toContain("create-expo-app");
    expect(packages).toContain("gt-react-native");
    expect(packages).toContain("nativewind");
    expect(packages).toContain("expo-localization");
  });
});

describe("classifyDrift", () => {
  it("classifies semver drift levels", () => {
    expect(classifyDrift("1.0.0", "1.0.0")).toBe("none");
    expect(classifyDrift("1.0.0", "1.0.1")).toBe("patch");
    expect(classifyDrift("1.0.0", "1.1.0")).toBe("minor");
    expect(classifyDrift("1.0.0", "2.0.0")).toBe("major");
  });
});

describe("runVerifyDocs", () => {
  it("passes when npm latest matches bundled baseline", async () => {
    const result = await runVerifyDocs(tierAWebConfig, {
      agentMode: true,
      manifest: testManifest,
      npmFetch: mockNpmFetch({
        "create-next-app": "15.0.0",
        "@clerk/nextjs": "6.0.0",
        "gt-next": "1.0.0",
        "gtx-cli": "1.0.0",
        shadcn: "2.0.0",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.blocks).toHaveLength(0);
    expect(result.entries.every((entry) => entry.drift === "none")).toBe(true);
  });

  it("blocks agent mode on major drift", async () => {
    const result = await runVerifyDocs(tierAWebConfig, {
      agentMode: true,
      manifest: testManifest,
      npmFetch: mockNpmFetch({
        "create-next-app": "16.0.0",
        "@clerk/nextjs": "6.0.0",
        "gt-next": "1.0.0",
        "gtx-cli": "1.0.0",
        shadcn: "2.0.0",
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.blocks.some((block) => block.package === "create-next-app")).toBe(true);
  });

  it("warns but does not block human mode on major drift", async () => {
    const result = await runVerifyDocs(tierAWebConfig, {
      agentMode: false,
      manifest: testManifest,
      npmFetch: mockNpmFetch({
        "create-next-app": "16.0.0",
        "@clerk/nextjs": "6.0.0",
        "gt-next": "1.0.0",
        "gtx-cli": "1.0.0",
        shadcn: "2.0.0",
      }),
    });

    expect(result.ok).toBe(true);
    expect(result.blocks).toHaveLength(0);
    expect(result.warns.some((warn) => warn.package === "create-next-app")).toBe(true);
  });

  it("blocks agent mode when npm fetch fails", async () => {
    const result = await runVerifyDocs(tierAWebConfig, {
      agentMode: true,
      manifest: testManifest,
      npmFetch: async () => ({ ok: false, error: "offline" }),
    });

    expect(result.ok).toBe(false);
    expect(result.blocks.length).toBeGreaterThan(0);
  });
});

describe("formatVerifyDocsReport", () => {
  it("includes package lines and docs url", async () => {
    const result = await runVerifyDocs(tierAWebConfig, {
      agentMode: false,
      manifest: testManifest,
      npmFetch: mockNpmFetch({
        "create-next-app": "15.0.0",
        "@clerk/nextjs": "6.0.0",
        "gt-next": "1.0.0",
        "gtx-cli": "1.0.0",
        shadcn: "2.0.0",
      }),
    });

    const report = formatVerifyDocsReport(result);
    expect(report).toContain("create-next-app");
    expect(report).toContain("https://example.com/next");
  });
});

describe("loadDocVersionsManifest", () => {
  it("loads bundled doc-versions.json", async () => {
    const { loadDocVersionsManifest } = await import("./verify-docs.js");
    const manifest = loadDocVersionsManifest();
    expect(manifest.version).toBe(1);
    expect(manifest.packages["create-next-app"]?.validated).toBeTruthy();
  });
});
