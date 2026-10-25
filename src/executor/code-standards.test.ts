import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseProjectConfig } from "../schema/project-config.js";

const assets = vi.hoisted(() => ({ directory: "" }));
vi.mock("../lib/paths.js", () => ({ captainPackageRoot: () => assets.directory }));
import { applyCodeStandards } from "./code-standards.js";

const directories: string[] = [];
const fixtureChecker = "// Explicit asset-copy fixture; this is not the integrated standards checker.\n";
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "captain-standards-"));
  directories.push(directory);
  return directory;
}

function writeManifest(directory: string, lint?: string, typescript?: string): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({
    scripts: { ...(lint ? { lint } : {}), typecheck: "tsc --noEmit" },
    devDependencies: typescript ? { typescript } : {},
  }));
}

function readManifest(directory: string) {
  return JSON.parse(readFileSync(join(directory, "package.json"), "utf-8")) as {
    scripts: Record<string, string>; devDependencies: Record<string, string>;
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("optional code standards", () => {
  it("executes preserved framework lint before the copied standards command", () => {
    assets.directory = temporaryDirectory();
    mkdirSync(join(assets.directory, "scripts"));
    writeFileSync(join(assets.directory, "scripts/check-code-standards.mjs"), 'console.log("standards fixture ran");\n');
    const target = temporaryDirectory();
    writeManifest(target, "node framework-lint.mjs");
    writeFileSync(join(target, "framework-lint.mjs"), 'console.log("framework ran");\n');
    const config = parseProjectConfig({ name: "example", scope: "@example", topology: "web", i18n: "gt-next", ui: "shadcn-base-ui", enforceCodeStandards: true });
    applyCodeStandards(config, target);
    const lint = readManifest(target).scripts.lint!;
    const passed = spawnSync(lint, { cwd: target, shell: true, encoding: "utf-8" });
    expect({ status: passed.status, stdout: passed.stdout }).toEqual({ status: 0, stdout: "framework ran\nstandards fixture ran\n" });
    writeFileSync(join(target, "framework-lint.mjs"), 'console.log("framework failed"); process.exit(7);\n');
    const failed = spawnSync(lint, { cwd: target, shell: true, encoding: "utf-8" });
    expect(failed.status).toBe(7);
    expect(failed.stdout).toBe("framework failed\n");
  });
  for (const topology of ["web", "mobile", "monorepo"] as const) {
    it.each([false, true])(`preserves ${topology} framework lint with enforcement %j`, (enabled) => {
      assets.directory = temporaryDirectory();
      mkdirSync(join(assets.directory, "scripts"));
      writeFileSync(join(assets.directory, "scripts/check-code-standards.mjs"), fixtureChecker);
      const target = temporaryDirectory();
      const rootLint = topology === "monorepo" ? "turbo lint" : topology === "web" ? "eslint ." : "expo lint";
      writeManifest(target, rootLint, "~5.9.2");
      const packages = ["apps/web", "apps/mobile", "packages/core", "packages/convex", "packages/ui"];
      if (topology === "monorepo") {
        for (const packagePath of packages) writeManifest(join(target, packagePath), "tsc --noEmit");
      }
      const config = parseProjectConfig({
        name: "example", scope: "@example", topology, enforceCodeStandards: enabled,
        i18n: topology === "web" ? "gt-next" : topology === "mobile" ? "none" : { web: "gt-next", mobile: "none" },
        ui: topology === "web" ? "shadcn-base-ui" : topology === "mobile" ? "nativewind" : { web: "shadcn-base-ui", mobile: "nativewind" },
        ...(topology !== "web" ? { runtime: "expo-go" } : {}),
      });
      const previousManifest = readFileSync(join(target, "package.json"), "utf-8");
      applyCodeStandards(config, target);
      expect(existsSync(join(target, "tools/check-code-standards.mjs"))).toBe(enabled);
      const manifest = readManifest(target);
      expect(manifest.scripts.lint).toBe(rootLint + (enabled ? " && node tools/check-code-standards.mjs ." : ""));
      expect(manifest.devDependencies.typescript).toBe("~5.9.2");
      if (!enabled) expect(readFileSync(join(target, "package.json"), "utf-8")).toBe(previousManifest);
      if (enabled) expect(readFileSync(join(target, "tools/check-code-standards.mjs"), "utf-8")).toBe(fixtureChecker);
      if (topology === "monorepo") {
        for (const packagePath of packages) {
          expect(readManifest(join(target, packagePath)).scripts.lint).toBe(
            "tsc --noEmit" + (enabled ? " && node ../../tools/check-code-standards.mjs ." : ""),
          );
        }
      }
      const first = readFileSync(join(target, "package.json"), "utf-8");
      applyCodeStandards(config, target);
      expect(readFileSync(join(target, "package.json"), "utf-8")).toBe(first);
    });
  }

  it("fails when the distributed checker asset is missing", () => {
    assets.directory = temporaryDirectory();
    const target = temporaryDirectory();
    writeManifest(target);
    const config = parseProjectConfig({ name: "example", scope: "@example", topology: "web", i18n: "gt-next", ui: "shadcn-base-ui", enforceCodeStandards: true });
    expect(() => applyCodeStandards(config, target)).toThrow(/check-code-standards/);
  });

  it.each([undefined, "~5.7.3", "^7.0.0"])("ensures a compatible root TypeScript version from %j", (version) => {
    assets.directory = temporaryDirectory();
    mkdirSync(join(assets.directory, "scripts"));
    writeFileSync(join(assets.directory, "scripts/check-code-standards.mjs"), fixtureChecker);
    const target = temporaryDirectory();
    writeManifest(target, undefined, version);
    applyCodeStandards(parseProjectConfig({ name: "example", scope: "@example", topology: "web", i18n: "gt-next", ui: "shadcn-base-ui", enforceCodeStandards: true }), target);
    expect(readManifest(target).devDependencies.typescript).toBe("^5.8.2");
    expect(readManifest(target).scripts.lint).toBe("node tools/check-code-standards.mjs .");
  });

  it.each(["~5.8.2", "^5.9.3", "~6.0.3"])("preserves the framework's compatible TypeScript version %s", (version) => {
    assets.directory = temporaryDirectory();
    mkdirSync(join(assets.directory, "scripts"));
    writeFileSync(join(assets.directory, "scripts/check-code-standards.mjs"), fixtureChecker);
    const target = temporaryDirectory();
    writeManifest(target, "eslint .", version);
    applyCodeStandards(parseProjectConfig({ name: "example", scope: "@example", topology: "web", i18n: "gt-next", ui: "shadcn-base-ui", enforceCodeStandards: true }), target);
    expect(readManifest(target).devDependencies.typescript).toBe(version);
  });
});
