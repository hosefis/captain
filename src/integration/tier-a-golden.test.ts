import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import { captainPackageRoot } from "../lib/paths.js";
import { runBootstrapPhase } from "../executor/run-bootstrap-phase.js";
import { normalizeProjectConfiguration, parseProjectConfiguration, type NormalizedProjectConfiguration, type ProjectConfiguration } from "../schema/project-configuration.js";
import { resolveSmokeSteps, runSmokeValidation } from "../validators/smoke.js";
import { resolvePackageManagerDriver } from "../executor/package-manager.js";
import type { PackageManager } from "../schema/project-configuration.js";

function tierABase(overrides: Partial<ProjectConfiguration>): ProjectConfiguration {
  return {
    name: "acme-platform",
    scope: "@acme",
    packageManager: "pnpm",
    topology: "web",
    backend: "rest",
    convexExample: false,
    enforceCodeStandards: false,
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
    configuration: normalizeProjectConfiguration(parseProjectConfiguration(tierABase({ topology: "web" }))),
  },
  {
    id: "mobile",
    configuration: normalizeProjectConfiguration(
      parseProjectConfiguration(
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
    configuration: normalizeProjectConfiguration(
      parseProjectConfiguration(
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
    configuration: parseProjectConfiguration(tierABase({
      topology: "mobile",
      runtime: "expo-go",
      auth: "none",
      i18n: "none",
      ui: "nativewind",
    })),
  },
  {
    id: "convex-web",
    configuration: parseProjectConfiguration(tierABase({ backend: "convex", auth: "none" })),
  },
  {
    id: "convex-expo-go-example",
    configuration: parseProjectConfiguration(tierABase({
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
    configuration: parseProjectConfiguration(tierABase({
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

const generatedDirectories: string[] = [];

afterAll(() => {
  for (const directory of generatedDirectories) rmSync(directory, { recursive: true, force: true });
});

function createTemporaryDirectory(label: string): string {
  const directory = join(
    tmpdir(),
    `captain-tier-a-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(directory, { recursive: true });
  generatedDirectories.push(directory);
  return directory;
}

/** Checks generated paths and contents for scaffold identity and configuration residue. */
function expectProjectOwnedFiles(directory: string): void {
  expect(existsSync(join(directory, "project.json"))).toBe(false);
  expect(existsSync(join(directory, "CONTEXT.md"))).toBe(true);
  expect(existsSync(join(directory, ".env.example"))).toBe(true);
  expect(readFileSync(join(directory, "AGENTS.md"), "utf-8")).toContain(
    readFileSync(join(captainPackageRoot(), "AGENTS.md"), "utf-8"),
  );
  expect(readFileSync(join(directory, "CLAUDE.md"), "utf-8")).toContain("@AGENTS.md");

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
function expectProviderConnections(directory: string, configuration: NormalizedProjectConfiguration): void {
  for (const app of configuration.apps) {
    const sourceDirectory = configuration.topology === "monorepo"
      ? join(directory, "apps", app, "src")
      : join(directory, "src");
    const provider = configuration.backend === "convex" ? "ConvexProvider" : "AuthenticationProvider";
    const providerPath = configuration.backend === "convex"
      ? "integrations/convex/convex-provider"
      : "integrations/auth/authentication-provider";
    if (configuration.backend !== "convex" && configuration.auth === "none") {
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
        const configuration = { ...fixture.configuration, packageManager };
        const directory = createTemporaryDirectory(fixture.id);

        const bootstrap = await runBootstrapPhase(configuration, directory, {
          bootstrapRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
          simulateBootstrapOutput: true,
        });

        expect(bootstrap.ok).toBe(true);
        if (!bootstrap.ok) {
          return;
        }

        expect(bootstrap.appliedRecipes).not.toContain("project-json");
        expect(bootstrap.appliedRecipes).toContain("starter-documentation");
        expectProjectOwnedFiles(directory);
        expectProviderConnections(directory, configuration);

        const smokeSteps = resolveSmokeSteps(configuration, true);
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

describe("enabled scaffolds with distributed checker assets (requires M1 integration)", () => {
  const checkerProcessTimeoutMilliseconds = 10_000;
  // Both CLI runs build a compiler program for each workspace configuration.
  const checkerCaseTimeoutMilliseconds = 2 * checkerProcessTimeoutMilliseconds + 5_000;

  for (const fixture of tierAFixtures) {
    it(`checks ${fixture.id} editable source and excludes external generated bindings`, async () => {
      const directory = createTemporaryDirectory(`standards-${fixture.id}`);
      const configuration = { ...fixture.configuration, enforceCodeStandards: true };
      const require = createRequire(import.meta.url);
      const typescriptDirectory = join(require.resolve("typescript/package.json"), "..");
      const result = await runBootstrapPhase(configuration, directory, {
        bootstrapRunner: async (step) => {
          if (step.id === "install-root") {
            mkdirSync(join(directory, "node_modules"), { recursive: true });
            symlinkSync(typescriptDirectory, join(directory, "node_modules/typescript"), "junction");
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        },
        simulateBootstrapOutput: true,
      });
      expect(result, "The packaged M1 checker must exist; this test does not substitute a fixture checker.").toMatchObject({ ok: true });
      expect(readFileSync(join(directory, "tools/check-code-standards.mjs"), "utf-8")).toBe(
        readFileSync(join(captainPackageRoot(), "scripts/check-code-standards.mjs"), "utf-8"),
      );
      mkdirSync(join(directory, "convex/_generated"), { recursive: true });
      writeFileSync(join(directory, "convex/_generated/invalid.ts"), 'export * from "external-generated";\n');
      const checked = spawnSync(process.execPath, ["tools/check-code-standards.mjs"], {
        cwd: directory, encoding: "utf-8", timeout: checkerProcessTimeoutMilliseconds,
      });
      expect({ status: checked.status, stdout: checked.stdout, stderr: checked.stderr }).toMatchObject({ status: 0 });
      writeFileSync(join(directory, "maintained-negative.ts"), "export function undocumented() {}\n");
      const rejected = spawnSync(process.execPath, ["tools/check-code-standards.mjs"], {
        cwd: directory, encoding: "utf-8", timeout: checkerProcessTimeoutMilliseconds,
      });
      expect(rejected.status).toBe(1);
      expect(`${rejected.stdout}${rejected.stderr}`).toContain("maintained-negative.ts");
    }, checkerCaseTimeoutMilliseconds);
  }
});
