import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { emitProjectGuidance } from "./project-guidance.js";
import type { NormalizedProjectConfiguration } from "../schema/project-configuration.js";
import { captainPackageRoot } from "../lib/paths.js";

const configuration: NormalizedProjectConfiguration = {
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

const directories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "captain-config-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("emitProjectGuidance", () => {
  it("writes project documentation and environment examples without scaffold configuration", () => {
    const targetDirectory = createTemporaryDirectory();

    emitProjectGuidance(configuration, targetDirectory);

    const context = readFileSync(join(targetDirectory, "CONTEXT.md"), "utf-8");
    expect(context).toContain("acme-web");
    expect(context).toContain("@acme");
    expect(context).not.toMatch(/captain|project\.json|compatibility\.json/i);

    const environmentExample = readFileSync(join(targetDirectory, ".env.example"), "utf-8");
    expect(environmentExample).toContain("DEFAULT_LOCALE=en");
    expect(environmentExample).not.toMatch(/captain/i);

    expect(existsSync(join(targetDirectory, "project.json"))).toBe(false);
    expect(readFileSync(join(targetDirectory, "AGENTS.md"), "utf-8")).toContain(
      readFileSync(join(captainPackageRoot(), "AGENTS.md"), "utf-8"),
    );
    expect(readFileSync(join(targetDirectory, "CLAUDE.md"), "utf-8")).toBe("@AGENTS.md\n");
    expect(existsSync(join(targetDirectory, "tools/check-code-standards.mjs"))).toBe(false);
  });

  it("preserves an existing project.json owned by the user", () => {
    const targetDirectory = createTemporaryDirectory();
    const contents = '{"customSetting":true}\n';
    writeFileSync(join(targetDirectory, "project.json"), contents);

    emitProjectGuidance(configuration, targetDirectory);

    expect(readFileSync(join(targetDirectory, "project.json"), "utf-8")).toBe(contents);
  });

  it("emits only Convex backend variables for a Convex project", () => {
    const targetDirectory = createTemporaryDirectory();

    emitProjectGuidance({ ...configuration, backend: "convex", convexExample: true }, targetDirectory);

    const environmentExample = readFileSync(join(targetDirectory, ".env.example"), "utf-8");
    expect(environmentExample).toContain("NEXT_PUBLIC_CONVEX_URL=");
    expect(environmentExample).not.toContain("API_BASE_URL");
    expect(readFileSync(join(targetDirectory, "CONTEXT.md"), "utf-8")).toContain(
      "Convex example | enabled",
    );
  });
});
