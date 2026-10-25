import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runBootstrapPhase } from "../executor/run-bootstrap-phase.js";
import { normalizeProjectConfig, parseProjectConfig, type NormalizedProjectConfig, type ProjectConfig } from "../schema/project-config.js";
import { resolveSmokeSteps, runSmokeValidation } from "../validators/smoke.js";
import { resolvePackageManagerDriver } from "../executor/package-manager.js";
import type { PackageManager } from "../schema/project-config.js";

function tierABase(overrides: Partial<ProjectConfig>): ProjectConfig {
  return {
    name: "acme-platform",
    scope: "@acme",
    packageManager: "pnpm",
    topology: "web",
    backend: "rest",
    convexExample: false,
    auth: "clerk",
    i18n: "gt-next",
    ui: "shadcn-base-ui",
    locales: ["en", "fr"],
    defaultLocale: "en",
    ...overrides,
  };
}

const tierAFixtures = [
  {
    id: "web",
    config: normalizeProjectConfig(parseProjectConfig(tierABase({ topology: "web" }))),
  },
  {
    id: "mobile",
    config: normalizeProjectConfig(
      parseProjectConfig(
        tierABase({
          topology: "mobile",
          runtime: "dev-build",
          i18n: "gt-react-native",
          ui: "nativewind",
        }),
      ),
    ),
  },
  {
    id: "monorepo",
    config: normalizeProjectConfig(
      parseProjectConfig(
        tierABase({
          topology: "monorepo",
          apps: ["web", "mobile"],
          runtime: "dev-build",
          i18n: { web: "gt-next", mobile: "gt-react-native" },
          ui: { web: "shadcn-base-ui", mobile: "nativewind" },
        }),
      ),
    ),
  },
  {
    id: "mobile-expo-go",
    config: parseProjectConfig(tierABase({
      topology: "mobile",
      runtime: "expo-go",
      auth: "none",
      i18n: "none",
      ui: "nativewind",
    })),
  },
  {
    id: "convex-web",
    config: parseProjectConfig(tierABase({ backend: "convex", auth: "none" })),
  },
  {
    id: "convex-expo-go-example",
    config: parseProjectConfig(tierABase({
      topology: "mobile",
      runtime: "expo-go",
      backend: "convex",
      convexExample: true,
      auth: "none",
      i18n: "none",
      ui: "nativewind",
    })),
  },
  {
    id: "convex-monorepo-example",
    config: parseProjectConfig(tierABase({
      topology: "monorepo",
      apps: ["web", "mobile"],
      runtime: "dev-build",
      backend: "convex",
      convexExample: true,
      auth: "clerk",
      i18n: { web: "gt-next", mobile: "gt-react-native" },
      ui: { web: "shadcn-base-ui", mobile: "nativewind" },
    })),
  },
] as const;

function makeTempDir(label: string): string {
  const dir = join(
    tmpdir(),
    `captain-tier-a-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Checks generated paths and contents for scaffold identity and configuration residue. */
function expectProjectOwnedFiles(directory: string): void {
  expect(existsSync(join(directory, "project.json"))).toBe(false);
  expect(existsSync(join(directory, "CONTEXT.md"))).toBe(true);
  expect(existsSync(join(directory, ".env.example"))).toBe(true);

  for (const relativePath of readdirSync(directory, { recursive: true, encoding: "utf-8" })) {
    expect(relativePath).not.toMatch(/captain/i);
    const path = join(directory, relativePath);
    if (!statSync(path).isFile()) {
      continue;
    }
    expect(readFileSync(path, "utf-8"), relativePath).not.toMatch(
      /captain|project\.json|compatibility\.json/i,
    );
  }
}

/** Checks that application layouts import and render the providers emitted beside them. */
function expectProviderConnections(directory: string, config: NormalizedProjectConfig): void {
  for (const app of config.apps) {
    const sourceDirectory = config.topology === "monorepo"
      ? join(directory, "apps", app, "src")
      : join(directory, "src");
    const provider = config.backend === "convex" ? "ConvexProvider" : "AuthenticationProvider";
    const providerPath = config.backend === "convex"
      ? "integrations/convex/convex-provider"
      : "integrations/auth/authentication-provider";
    if (config.backend !== "convex" && config.auth === "none") {
      expect(existsSync(join(sourceDirectory, `${providerPath}.tsx`))).toBe(false);
      continue;
    }
    const layout = readFileSync(
      join(sourceDirectory, "app", app === "web" ? "layout.tsx" : "_layout.tsx"),
      "utf-8",
    );
    expect(layout).toContain(`import { ${provider} } from "@/${providerPath}"`);
    expect(layout).toContain(`<${provider}>`);
    expect(layout).toContain(`</${provider}>`);
    expect(readFileSync(join(sourceDirectory, `${providerPath}.tsx`), "utf-8")).toContain(
      `export function ${provider}(`,
    );
  }
}

describe("Tier A golden fixtures (pre-publish matrix)", () => {
  for (const packageManager of ["pnpm", "npm", "bun"] as PackageManager[]) {
    for (const fixture of tierAFixtures) {
      it(`scaffolds ${packageManager} ${fixture.id} and passes agent smoke plan`, async () => {
        const config = { ...fixture.config, packageManager };
        const directory = makeTempDir(fixture.id);

        const bootstrap = await runBootstrapPhase(config, directory, {
          bootstrapRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
          simulateBootstrapOutput: true,
        });

        expect(bootstrap.ok).toBe(true);
        if (!bootstrap.ok) {
          return;
        }

        expect(bootstrap.appliedRecipes).not.toContain("project-json");
        expectProjectOwnedFiles(directory);
        expectProviderConnections(directory, config);

        const smokeSteps = resolveSmokeSteps(config, true);
        expect(smokeSteps).toEqual(["typecheck", "lint", "build"]);

        const smoke = await runSmokeValidation(directory, smokeSteps, {
          packageManager,
          runner: async (step, command, commandArguments) => {
            expect({ command, commandArguments }).toEqual(
              resolvePackageManagerDriver(packageManager).runScript(step),
            );
            return { exitCode: 0, stdout: "", stderr: "" };
          },
        });

        expect(smoke.ok).toBe(true);
      });
    }
  }
});
