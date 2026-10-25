import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { documentStarterSource, findStarterSourceFiles } from "./starter-documentation.js";

const directories: string[] = [];
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "captain-starter-docs-"));
  directories.push(directory);
  return directory;
}

function writeTurboPresets(directory: string): void {
  const providerDirectory = join(directory, "packages/eslint-config");
  mkdirSync(providerDirectory, { recursive: true });
  writeFileSync(join(providerDirectory, "package.json"), JSON.stringify({
    name: "@repo/eslint-config",
    exports: { "./react-internal": "./react-internal.js", "./next-js": "./next.js" },
  }));
  writeFileSync(join(providerDirectory, "react-internal.js"), 'export const config = [{ rules: { "no-console": "error" } }];\n');
  writeFileSync(join(providerDirectory, "next.js"), 'export const nextJsConfig = [{ rules: { "no-console": "error" } }];\n');
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("editable framework starter documentation", () => {
  it.each([
    { relativePath: "packages/ui/eslint.config.mjs", presetName: "config", modulePath: "react-internal", newline: "\n" },
    { relativePath: "packages/ui/eslint.config.mjs", presetName: "config", modulePath: "react-internal", newline: "\r\n" },
    { relativePath: "apps/docs/eslint.config.js", presetName: "nextJsConfig", modulePath: "next-js", newline: "\n" },
    { relativePath: "apps/docs/eslint.config.js", presetName: "nextJsConfig", modulePath: "next-js", newline: "\r\n" },
  ])("composes the captured $relativePath preset array preserving surrounding bytes", ({ relativePath, presetName, modulePath, newline }) => {
    const directory = temporaryDirectory();
    writeTurboPresets(directory);
    const filePath = join(directory, relativePath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    const original = `\uFEFF// Keep framework prefix.${newline}import { ${presetName} } from "@repo/eslint-config/${modulePath}";${newline}/** Preserve existing docs. */${newline}export default ${presetName};${newline}// Keep application suffix.${newline}`;
    writeFileSync(filePath, original);
    const capturedFiles = findStarterSourceFiles(directory);
    expect(capturedFiles).toContain(filePath);
    documentStarterSource(directory, ts, capturedFiles);
    const prepared = readFileSync(filePath, "utf-8");
    expect(prepared).toBe(original.replace(`export default ${presetName};`, `export default [...${presetName}];`));
    documentStarterSource(directory, ts, capturedFiles);
    expect(readFileSync(filePath, "utf-8")).toBe(prepared);
  });

  it.each([
    'import { config } from "@application/eslint-config/react-internal";\nexport default config;\n',
    'import { preset as config } from "@repo/eslint-config/react-internal";\nexport default config;\n',
    'import { config, other } from "@repo/eslint-config/react-internal";\nexport default config;\n',
    'import customDefault, { config } from "@repo/eslint-config/react-internal";\nexport default config;\n',
    'import { type config } from "@repo/eslint-config/react-internal";\nexport default config;\n',
    'import { config } from "@repo/eslint-config/react-internal";\nexport default [...config, { rules: { "no-console": "error" } }];\n',
    'import { config } from "@repo/eslint-config/react-internal";\nconst applicationRules = {};\nexport default config;\n',
    'import { config } from "@repo/eslint-config/react-internal";\nexport default customize(config);\n',
    'import { config } from "@repo/eslint-config/react-internal";\nexport const metadata = { rules: { "no-console": "error" } };\nexport default [...config, metadata];\n',
  ])("retains custom Turbo configuration byte content %#", (original) => {
    const directory = temporaryDirectory();
    writeTurboPresets(directory);
    const filePath = join(directory, "packages/ui/eslint.config.mjs");
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, original);
    documentStarterSource(directory, ts);
    expect(readFileSync(filePath, "utf-8")).toBe(original);
  });

  it.each([
    'export const config = { rules: { "no-console": "error" } };\n',
    'export { config } from "./custom.js";\n',
    'const config = [];\n',
    'export let config = [];\nconfig = { rules: { "no-console": "error" } };\n',
  ])("preserves a configuration whose provider is not a known exported array %#", (provider) => {
    const directory = temporaryDirectory();
    writeTurboPresets(directory);
    writeFileSync(join(directory, "packages/eslint-config/react-internal.js"), provider);
    const filePath = join(directory, "packages/ui/eslint.config.mjs");
    mkdirSync(join(filePath, ".."), { recursive: true });
    const original = 'import { config } from "@repo/eslint-config/react-internal";\nexport default config;\n';
    writeFileSync(filePath, original);
    documentStarterSource(directory, ts);
    expect(readFileSync(filePath, "utf-8")).toBe(original);
  });

  it("preserves unknown paths, uncaptured files and changed workspace exports", () => {
    const directory = temporaryDirectory();
    writeTurboPresets(directory);
    const original = 'import { config } from "@repo/eslint-config/react-internal";\nexport default config;\n';
    const unknownPath = join(directory, "custom/packages/ui/eslint.config.mjs");
    const knownPath = join(directory, "packages/ui/eslint.config.mjs");
    for (const filePath of [unknownPath, knownPath]) {
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, original);
    }
    expect(findStarterSourceFiles(directory)).not.toContain(unknownPath);
    documentStarterSource(directory, ts, []);
    expect(readFileSync(knownPath, "utf-8")).toBe(original);
    writeFileSync(join(directory, "packages/eslint-config/package.json"), JSON.stringify({
      name: "@repo/eslint-config", exports: { "./react-internal": "./custom.js" },
    }));
    documentStarterSource(directory, ts);
    expect(readFileSync(knownPath, "utf-8")).toBe(original);
    expect(readFileSync(unknownPath, "utf-8")).toBe(original);
  });

  it("loads the installed generated project's compiler without a Captain runtime dependency", () => {
    const directory = temporaryDirectory();
    const require = createRequire(import.meta.url);
    const compilerDirectory = join(require.resolve("typescript/package.json"), "..");
    mkdirSync(join(directory, "node_modules"));
    symlinkSync(compilerDirectory, join(directory, "node_modules/typescript"), "junction");
    writeFileSync(join(directory, "page.tsx"), "export default function Home() { return null; }\n");
    documentStarterSource(directory);
    expect(readFileSync(join(directory, "page.tsx"), "utf-8")).toContain("/** Displays the application's starter home page. */");
  });

  it("fails clearly when the generated project has no installed TypeScript", () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, "page.tsx"), "export default function Home() { return null; }\n");
    expect(() => documentStarterSource(directory)).toThrow(/typescript/);
  });

  it("does not resolve a compiler for pure fixtures without recognized starter source", () => {
    const directory = temporaryDirectory();
    const contents = "export function BusinessAction() { return true; }\n";
    writeFileSync(join(directory, "business-action.ts"), contents);
    documentStarterSource(directory);
    expect(readFileSync(join(directory, "business-action.ts"), "utf-8")).toBe(contents);
  });
  it.each([
    ["src/app/page.tsx", 'import Image from "next/image";\nexport default function Home() { return <Image src="/next.svg" alt="Next" width={180} height={38} />; }\n'],
    ["src/components/themed-text.tsx", 'export type ThemedTextProps = { children: string };\nexport function ThemedText({ children }: ThemedTextProps) { return <span>{children}</span>; }\n'],
    ["packages/ui/src/button.tsx", '"use client";\ninterface ButtonProps { appName: string; }\nexport const Button = ({ appName }: ButtonProps) => <button onClick={() => alert(`Hello from ${appName}`)}>Open</button>;\n'],
  ])("adds specific intent without changing the implementation of %s", (relativePath, original) => {
    const directory = temporaryDirectory();
    const filePath = join(directory, relativePath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, original);
    documentStarterSource(directory, ts);
    const documented = readFileSync(filePath, "utf-8");
    expect(documented).toContain("/** ");
    expect(documented.replace(/\/\*\*[^]*?\*\/\n/g, "")).toBe(original);
    const printer = ts.createPrinter();
    const parse = (contents: string) => ts.createSourceFile(filePath, contents, ts.ScriptTarget.Latest, true);
    expect(printer.printFile(parse(documented))).toContain("/**");
    documentStarterSource(directory, ts);
    expect(readFileSync(filePath, "utf-8")).toBe(documented);
  });

  it("replaces only the recognized native hook forward with a callable wrapper", () => {
    const directory = temporaryDirectory();
    const filePath = join(directory, "use-color-scheme.ts");
    writeFileSync(filePath, "export { useColorScheme } from 'react-native';\r\n");
    documentStarterSource(directory, ts);
    const contents = readFileSync(filePath, "utf-8");
    expect(contents).toContain('import { useColorScheme as useNativeColorScheme } from "react-native";');
    expect(contents).toContain("export function useColorScheme()");
    expect(contents).toContain("return useNativeColorScheme();");
    expect(contents).not.toMatch(/(?<!\r)\n/);
    documentStarterSource(directory, ts);
    expect(readFileSync(filePath, "utf-8")).toBe(contents);
  });

  it.each([
    'export type { useColorScheme } from "react-native";\n',
    'export { type useColorScheme } from "react-native";\n',
  ])("does not turn type-only forwards into runtime functions", (contents) => {
    const directory = temporaryDirectory();
    const filePath = join(directory, "use-color-scheme.ts");
    writeFileSync(filePath, contents);
    documentStarterSource(directory, ts);
    expect(readFileSync(filePath, "utf-8")).toBe(contents);
  });

  it("retains existing docs, unknown application code, literals, and external generated files", () => {
    const directory = temporaryDirectory();
    const originals = {
      "page.tsx": '/** Custom docs. */\nexport default function Home() { return "export function Home()"; }',
      "custom.tsx": 'export function Home() { return "custom"; }',
      "button.tsx": 'export function BusinessAction() { return "custom"; }',
      "convex/_generated/page.tsx": 'export default function Home() { return "generated"; }',
      "node_modules/library/page.tsx": 'export default function Home() { return "external"; }',
      "use-color-scheme.ts": "export { useColorScheme, useWindowDimensions } from 'react-native';",
    };
    for (const [relativePath, contents] of Object.entries(originals)) {
      const filePath = join(directory, relativePath);
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, contents);
    }
    documentStarterSource(directory, ts);
    for (const [relativePath, contents] of Object.entries(originals)) {
      expect(readFileSync(join(directory, relativePath), "utf-8")).toBe(contents);
    }
  });

  it("keeps arbitrary maintained _generated folders in the documentation scan", () => {
    const directory = temporaryDirectory();
    const maintainedDirectory = join(directory, "src/_generated");
    mkdirSync(maintainedDirectory, { recursive: true });
    const filePath = join(maintainedDirectory, "page.tsx");
    writeFileSync(filePath, "export default function Home() { return null; }\n");
    documentStarterSource(directory, ts);
    expect(readFileSync(filePath, "utf-8")).toContain("/** Displays the application's starter home page. */");
  });
});
