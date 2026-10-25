import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runBootstrapPhase } from "./run-bootstrap-phase.js";
import type { NormalizedProjectConfiguration } from "../schema/project-configuration.js";
import ts from "typescript";

const webConfiguration: NormalizedProjectConfiguration = {
  name: "acme-web",
  scope: "@acme",
  packageManager: "pnpm",
  topology: "web",
  apps: ["web"],
  backend: "rest",
  convexExample: false,
  enforceCodeStandards: false,
  auth: "clerk",
  i18n: { web: "gt-next" },
  ui: { web: "shadcn-base-ui" },
  locales: ["en", "fr"],
  defaultLocale: "en",
  stacks: { hasWeb: true, hasMobile: false },
};

const generatedDirectories: string[] = [];

afterEach(() => {
  for (const directory of generatedDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function createTemporaryDirectory(): string {
  const directory = join(tmpdir(), `captain-phase-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(directory, { recursive: true });
  generatedDirectories.push(directory);
  return directory;
}

describe("runBootstrapPhase", () => {
  it.each([false, true])("retains Expo framework rules and hydration compatibility with enforcement %j", async (enabled) => {
    const directory = createTemporaryDirectory();
    const originalConfiguration = 'module.exports = [{ rules: { "no-console": "error" } }];\r\n';
    const hook = 'export function useColorScheme() { useEffect(() => { setHasHydrated(true); }, []); return "light"; }\n';
    const configuration: NormalizedProjectConfiguration = {
      ...webConfiguration, topology: "mobile", apps: ["mobile"], auth: "none", runtime: "expo-go",
      i18n: { mobile: "none" }, ui: { mobile: "nativewind" },
      stacks: { hasWeb: false, hasMobile: true }, enforceCodeStandards: enabled,
    };
    const result = await runBootstrapPhase(configuration, directory, {
      simulateBootstrapOutput: true,
      starterCompiler: ts,
      bootstrapRunner: async (step) => {
        if (step.id === "bootstrap-mobile") {
          mkdirSync(join(directory, "src/hooks"), { recursive: true });
          writeFileSync(join(directory, "src/hooks/use-color-scheme.web.ts"), hook);
          writeFileSync(join(directory, "eslint.config.js"), originalConfiguration);
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    });
    expect(result).toMatchObject({ ok: true, appliedRecipes: expect.arrayContaining(["starter-documentation", "expo-starter-lint"]) });
    const eslintConfiguration = readFileSync(join(directory, "eslint.config.js"), "utf-8");
    expect(eslintConfiguration.startsWith(originalConfiguration)).toBe(true);
    expect(eslintConfiguration).toContain('"react-hooks/set-state-in-effect": "off"');
    expect(readFileSync(join(directory, "src/hooks/use-color-scheme.web.ts"), "utf-8")).toContain("/** Returns the platform color scheme after web hydration when applicable. */");
    expect(existsSync(join(directory, "tools/check-code-standards.mjs"))).toBe(enabled);
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf-8")) as { devDependencies?: Record<string, string> };
    expect(manifest.devDependencies?.typescript).toBe(enabled ? "^5.8.2" : undefined);
  });

  it.each([false, true])("documents editable starter source with enforcement %j", async (enabled) => {
    const directory = createTemporaryDirectory();
    const progress: string[] = [];
    const original = "export default function Home() { return null; }\n";
    const result = await runBootstrapPhase({ ...webConfiguration, enforceCodeStandards: enabled }, directory, {
      simulateBootstrapOutput: true,
      starterCompiler: ts,
      bootstrapRunner: async (step) => {
        if (step.id === "bootstrap-web") {
          mkdirSync(join(directory, "src/app"), { recursive: true });
          writeFileSync(join(directory, "src/app/page.tsx"), original);
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      onProgress: (event) => progress.push(`${event.status}:${event.id}`),
    });
    expect(result).toMatchObject({ ok: true, appliedRecipes: expect.arrayContaining(["starter-documentation"]) });
    expect(readFileSync(join(directory, "src/app/page.tsx"), "utf-8")).toBe(
      `/** Displays the application's starter home page. */\n${original}`,
    );
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf-8")) as {
      scripts: Record<string, string>; devDependencies?: Record<string, string>;
    };
    expect(existsSync(join(directory, "tools/check-code-standards.mjs"))).toBe(enabled);
    expect(manifest.devDependencies?.typescript).toBe(enabled ? "^5.8.2" : undefined);
    expect(manifest.scripts.lint).toBe("eslint ." + (enabled ? " && node tools/check-code-standards.mjs ." : ""));
    expect(progress.indexOf("start:starter-documentation")).toBeGreaterThan(progress.indexOf("complete:install-root"));
    expect(progress).toContain("complete:starter-documentation");
  });

  it("completes end-to-end with mocked bootstrap runner", async () => {
    const targetDirectory = createTemporaryDirectory();
    const progress: string[] = [];

    const result = await runBootstrapPhase(webConfiguration, targetDirectory, {
      bootstrapRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      simulateBootstrapOutput: true,
      onProgress: (event) => progress.push(`${event.status}:${event.id}`),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.completedBootstrapSteps).toEqual([
      "bootstrap-web",
      "install-root",
    ]);
    expect(result.appliedRecipes).toContain("project-structure");
    expect(result.appliedRecipes).toContain("backend-rest");
    expect(result.appliedRecipes).toContain("module-authorization");
    expect(result.appliedRecipes).toContain("auth-clerk");
    expect(result.appliedRecipes).toContain("starter-documentation");
    expect(existsSync(join(targetDirectory, "src", "lib", "backend", "client.ts"))).toBe(true);
    expect(existsSync(join(targetDirectory, "src", "features", "authorization", "types.ts"))).toBe(true);
    expect(existsSync(join(targetDirectory, "CONTEXT.md"))).toBe(true);
    expect(existsSync(join(targetDirectory, ".env.example"))).toBe(true);
    expect(existsSync(join(targetDirectory, "project.json"))).toBe(false);
    expect(result.appliedRecipes).not.toContain("project-json");
    expect(readFileSync(join(targetDirectory, "package.json"), "utf-8")).toContain('"name": "acme-web"');
    expect(existsSync(join(targetDirectory, "src/lib/backend/client.ts"))).toBe(true);
    expect(existsSync(join(targetDirectory, "turbo.json"))).toBe(false);
    expect(progress).toContain("start:bootstrap-web");
    expect(progress).toContain("complete:bootstrap-web");
    expect(progress).toContain("start:backend-rest");
    expect(progress).toContain("complete:install-root");
  });

  it("returns bootstrap failure from runner", async () => {
    const targetDirectory = createTemporaryDirectory();

    const result = await runBootstrapPhase(webConfiguration, targetDirectory, {
      bootstrapRunner: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "network error",
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.phase).toBe("bootstrap");
    expect(result.message).toContain("bootstrap-web");
  });
});
