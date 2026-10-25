import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";
import { applyExpoStarterLintCompatibility } from "./expo-lint-compatibility.js";

const directories: string[] = [];
const hydrationHook = 'export function useColorScheme() { useEffect(() => { setHasHydrated(true); }, []); return "light"; }\n';

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "captain-expo-lint-"));
  directories.push(directory);
  mkdirSync(join(directory, "src/hooks"), { recursive: true });
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Expo starter lint compatibility", () => {
  it.each(["js", "cjs", "cts"])("preserves CommonJS %s contents and appends an idempotent narrow extension", (extension) => {
    const directory = temporaryDirectory();
    const original = 'const frameworkConfiguration = [{ rules: { "no-console": "error" } }];\r\nmodule.exports = frameworkConfiguration;';
    const filePath = join(directory, `eslint.config.${extension}`);
    writeFileSync(filePath, original);
    writeFileSync(join(directory, "src/hooks/use-color-scheme.web.ts"), hydrationHook);
    applyExpoStarterLintCompatibility(directory, ts);
    const patched = readFileSync(filePath, "utf-8");
    expect(patched.startsWith(original)).toBe(true);
    expect(patched).toContain('defineConfig(module.exports, { files: ["src/hooks/use-color-scheme.web.ts"]');
    expect(patched).toContain('"react-hooks/set-state-in-effect": "off"');
    expect(patched).not.toMatch(/(?<!\r)\n/);
    applyExpoStarterLintCompatibility(directory, ts);
    expect(readFileSync(filePath, "utf-8")).toBe(patched);
  });

  it.each(["js", "mjs", "ts", "mts"])("preserves ESM %s configuration expressions and their application rules", (extension) => {
    const directory = temporaryDirectory();
    const prefix = 'const frameworkConfiguration = [{ rules: { "no-console": "error" } }];\n';
    const original = `${prefix}export default frameworkConfiguration;`;
    const filePath = join(directory, `eslint.config.${extension}`);
    writeFileSync(filePath, original);
    writeFileSync(join(directory, "src/hooks/use-color-scheme.web.ts"), hydrationHook);
    applyExpoStarterLintCompatibility(directory, ts);
    const patched = readFileSync(filePath, "utf-8");
    expect(patched.startsWith(prefix)).toBe(true);
    expect(patched).toContain('export default defineExpoStarterLintConfiguration(frameworkConfiguration, { files: ["src/hooks/use-color-scheme.web.ts"]');
    expect(patched).toContain('import { defineConfig as defineExpoStarterLintConfiguration } from "eslint/config";');
    expect(ts.transpileModule(patched, { reportDiagnostics: true }).diagnostics).toEqual([]);
    applyExpoStarterLintCompatibility(directory, ts);
    expect(readFileSync(filePath, "utf-8")).toBe(patched);
  });

  it("does not resolve a compiler when no upstream hydration hook exists", () => {
    const directory = temporaryDirectory();
    const original = "module.exports = [];";
    writeFileSync(join(directory, "eslint.config.js"), original);
    applyExpoStarterLintCompatibility(directory);
    expect(readFileSync(join(directory, "eslint.config.js"), "utf-8")).toBe(original);
  });

  it.each([
    'export const hint = "setHasHydrated(true)";\n',
    'export function useColorScheme() { setHasHydrated(true); return "light"; }\n',
  ])("keeps other application hooks and configuration unchanged", (contents) => {
    const directory = temporaryDirectory();
    const original = "module.exports = [];";
    writeFileSync(join(directory, "eslint.config.js"), original);
    writeFileSync(join(directory, "src/hooks/use-color-scheme.web.ts"), contents);
    applyExpoStarterLintCompatibility(directory, ts);
    expect(readFileSync(join(directory, "eslint.config.js"), "utf-8")).toBe(original);
  });
});
