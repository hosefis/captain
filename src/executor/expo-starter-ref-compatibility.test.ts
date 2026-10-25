import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";
import { applyExpoStarterRefCompatibility } from "./expo-starter-ref-compatibility.js";

const directories: string[] = [];
const originalType = "TabTriggerSlotProps";
const correctedType = 'Omit<TabTriggerSlotProps, "ref"> & Pick<import("react").ComponentProps<typeof Pressable>, "ref">';
const starter = `import { TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable } from 'react-native';

/** Displays a navigation tab and its focused state. */
export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type={isFocused ? 'backgroundSelected' : 'backgroundElement'}>
        {children}
      </ThemedView>
    </Pressable>
  );
}
`;

function createFixture(contents: string, relativePath = "src/components/app-tabs.web.tsx") {
  const directory = mkdtempSync(join(tmpdir(), "captain-expo-ref-"));
  directories.push(directory);
  const filePath = join(directory, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
  return { directory, filePath };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Expo starter ref compatibility", () => {
  it.each(["\n", "\r\n"])("changes only the recognized parameter type with newline %j", (newline) => {
    const original = `\uFEFF${starter.replaceAll("\n", newline)}// Keep user suffix bytes.${newline}`;
    const { directory, filePath } = createFixture(original);
    applyExpoStarterRefCompatibility(directory, [filePath], ts);
    const corrected = readFileSync(filePath, "utf-8");
    expect(corrected).toBe(original.replace(`: ${originalType})`, `: ${correctedType})`));
    const compilerOptions = { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ESNext };
    expect(ts.transpileModule(corrected, { compilerOptions }).outputText).toBe(
      ts.transpileModule(original, { compilerOptions }).outputText,
    );
    applyExpoStarterRefCompatibility(directory, [filePath], ts);
    expect(readFileSync(filePath, "utf-8")).toBe(corrected);
  });

  it.each([
    starter.replace("'expo-router/ui'", "'./custom-tabs'"),
    starter.replace("'react-native'", "'./custom-pressable'"),
    starter.replace("{ Pressable }", "{ Other as Pressable }"),
    starter.replace("{ TabTriggerSlotProps }", "{ Other as TabTriggerSlotProps }"),
    starter.replace("export function TabButton", "function TabButton"),
    starter.replace("function TabButton(", "function TabButton<TabTriggerSlotProps>("),
    starter.replace("...props", "...otherProperties"),
    starter.replace("<Pressable {...props}", "<OtherButton {...props}").replace("</Pressable>", "</OtherButton>"),
    starter.replace("{...props}", "{...otherProperties}"),
    starter.replace(`: ${originalType})`, ": CustomTabButtonProps)"),
    starter.replace(`: ${originalType})`, `: ${correctedType})`),
    starter.replace("  return (", "  recordRender();\n  return ("),
  ])("preserves unrecognized or already corrected source %#", (original) => {
    const { directory, filePath } = createFixture(original);
    applyExpoStarterRefCompatibility(directory, [filePath], ts);
    expect(readFileSync(filePath, "utf-8")).toBe(original);
  });

  it("preserves matching user files outside the captured starter paths", () => {
    const { directory, filePath } = createFixture(starter);
    applyExpoStarterRefCompatibility(directory, [], ts);
    expect(readFileSync(filePath, "utf-8")).toBe(starter);
  });

  it("ignores matching source under another filename", () => {
    const { directory, filePath } = createFixture(starter, "src/components/user-tabs.web.tsx");
    applyExpoStarterRefCompatibility(directory, [filePath], ts);
    expect(readFileSync(filePath, "utf-8")).toBe(starter);
  });

  it("does not need installed dependencies without the recognized starter", () => {
    const { directory } = createFixture("export const title = 'Custom tabs';");
    expect(() => applyExpoStarterRefCompatibility(directory, [])).not.toThrow();
  });
});
