import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type ts from "typescript";

const compatibilityMarker = "/** Expo starter hydration compatibility. */";
const compatibilityConfiguration = '{ files: ["src/hooks/use-color-scheme.web.ts"], rules: { "react-hooks/set-state-in-effect": "off" } }';

function hasHydrationEffect(source: ts.SourceFile, compiler: typeof ts): boolean {
  let found = false;
  const visitSetter = (node: ts.Node): void => {
    if (compiler.isCallExpression(node) && compiler.isIdentifier(node.expression) &&
        node.expression.text === "setHasHydrated" && node.arguments.length === 1 &&
        node.arguments[0]!.kind === compiler.SyntaxKind.TrueKeyword) {
      found = true;
    }
    compiler.forEachChild(node, visitSetter);
  };
  const visit = (node: ts.Node): void => {
    if (compiler.isCallExpression(node) && compiler.isIdentifier(node.expression) && node.expression.text === "useEffect") {
      const callback = node.arguments[0];
      if (callback && (compiler.isArrowFunction(callback) || compiler.isFunctionExpression(callback))) visitSetter(callback.body);
    }
    compiler.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function assignsCommonJsConfiguration(statement: ts.Statement, compiler: typeof ts): boolean {
  if (!compiler.isExpressionStatement(statement) || !compiler.isBinaryExpression(statement.expression)) return false;
  const assignment = statement.expression;
  if (assignment.operatorToken.kind !== compiler.SyntaxKind.EqualsToken || !compiler.isPropertyAccessExpression(assignment.left)) return false;
  return compiler.isIdentifier(assignment.left.expression) && assignment.left.expression.text === "module" && assignment.left.name.text === "exports";
}

/** Retains framework ESLint checks and the upstream Expo hydration hook's narrow compatibility exception. */
export function applyExpoStarterLintCompatibility(applicationDirectory: string, compiler?: typeof ts): void {
  const hookPath = join(applicationDirectory, "src/hooks/use-color-scheme.web.ts");
  if (!existsSync(hookPath)) return;

  const installedCompiler = compiler ?? createRequire(join(applicationDirectory, "package.json"))("typescript") as typeof ts;
  const hook = installedCompiler.createSourceFile(hookPath, readFileSync(hookPath, "utf-8"), installedCompiler.ScriptTarget.Latest, true);
  if (!hasHydrationEffect(hook, installedCompiler)) return;

  const configurationName = ["js", "mjs", "cjs", "ts", "mts", "cts"]
    .map((extension) => `eslint.config.${extension}`)
    .find((name) => existsSync(join(applicationDirectory, name)));
  if (!configurationName) throw new Error("Expo starter ESLint configuration is missing");
  const configurationPath = join(applicationDirectory, configurationName);
  const contents = readFileSync(configurationPath, "utf-8");
  if (contents.includes(compatibilityMarker)) return;

  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const source = installedCompiler.createSourceFile(configurationPath, contents, installedCompiler.ScriptTarget.Latest, true);
  if (source.statements.some((statement) => assignsCommonJsConfiguration(statement, installedCompiler))) {
    writeFileSync(configurationPath, `${contents}${newline}${compatibilityMarker}${newline}module.exports = require("eslint/config").defineConfig(module.exports, ${compatibilityConfiguration});${newline}`, "utf-8");
    return;
  }

  const exported = source.statements.find((statement): statement is ts.ExportAssignment =>
    installedCompiler.isExportAssignment(statement) && !statement.isExportEquals);
  if (!exported) throw new Error("Expo starter ESLint configuration must export a flat configuration");
  let binding = "defineExpoStarterLintConfiguration";
  while (contents.includes(binding)) binding += "_";
  const start = exported.expression.getStart(source);
  const end = exported.expression.end;
  const expression = contents.slice(start, end);
  const patched = `${contents.slice(0, start)}${binding}(${expression}, ${compatibilityConfiguration})${contents.slice(end)}`;
  writeFileSync(configurationPath, `${patched}${newline}${compatibilityMarker}${newline}import { defineConfig as ${binding} } from "eslint/config";${newline}`, "utf-8");
}
