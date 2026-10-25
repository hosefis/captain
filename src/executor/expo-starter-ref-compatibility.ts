import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type ts from "typescript";

function importsBinding(source: ts.SourceFile, moduleName: string, name: string, compiler: typeof ts): boolean {
  return source.statements.some((statement) => {
    if (!compiler.isImportDeclaration(statement) || !compiler.isStringLiteral(statement.moduleSpecifier)) return false;
    if (statement.moduleSpecifier.text !== moduleName) return false;
    const bindings = statement.importClause?.namedBindings;
    return bindings !== undefined && compiler.isNamedImports(bindings) &&
      bindings.elements.some((binding) => binding.name.text === name && !binding.propertyName);
  });
}

function starterRefAnnotation(statement: ts.Statement, source: ts.SourceFile, compiler: typeof ts): ts.TypeNode | undefined {
  if (!compiler.isFunctionDeclaration(statement) || statement.name?.text !== "TabButton" || statement.parameters.length !== 1) return undefined;
  if (statement.typeParameters?.length) return undefined;
  if (!statement.modifiers?.some((modifier) => modifier.kind === compiler.SyntaxKind.ExportKeyword)) return undefined;
  const parameter = statement.parameters[0]!;
  if (!parameter.type || parameter.type.getText(source) !== "TabTriggerSlotProps") return undefined;
  if (parameter.name.getText(source).replace(/\s/g, "") !== "{children,isFocused,...props}") return undefined;
  if (statement.body?.statements.length !== 1) return undefined;
  const returned = statement.body.statements[0]!;
  if (!compiler.isReturnStatement(returned) || !returned.expression) return undefined;
  const expression = compiler.isParenthesizedExpression(returned.expression) ? returned.expression.expression : returned.expression;
  if (!compiler.isJsxElement(expression) || expression.openingElement.tagName.getText(source) !== "Pressable") return undefined;
  const firstAttribute = expression.openingElement.attributes.properties[0];
  if (!firstAttribute || !compiler.isJsxSpreadAttribute(firstAttribute) || firstAttribute.expression.getText(source) !== "props") return undefined;
  return parameter.type;
}

/** Reconciles recognized Expo tab refs with the rendered Pressable's instance type. */
export function applyExpoStarterRefCompatibility(
  applicationDirectory: string,
  starterSourceFiles: readonly string[],
  compiler?: typeof ts,
): void {
  const filePath = join(applicationDirectory, "src/components/app-tabs.web.tsx");
  if (!starterSourceFiles.some((sourcePath) => resolve(sourcePath) === resolve(filePath)) || !existsSync(filePath)) return;
  const installedCompiler = compiler ?? createRequire(join(applicationDirectory, "package.json"))("typescript") as typeof ts;
  const contents = readFileSync(filePath, "utf-8");
  const source = installedCompiler.createSourceFile(filePath, contents, installedCompiler.ScriptTarget.Latest, true);
  if (!importsBinding(source, "expo-router/ui", "TabTriggerSlotProps", installedCompiler) ||
      !importsBinding(source, "react-native", "Pressable", installedCompiler)) return;
  const parameter = source.statements.map((statement) => starterRefAnnotation(statement, source, installedCompiler)).find(Boolean);
  if (!parameter) return;

  // Expo Router's legacy Ref<View> names a component under React Native's strict API.
  const replacement = 'Omit<TabTriggerSlotProps, "ref"> & Pick<import("react").ComponentProps<typeof Pressable>, "ref">';
  writeFileSync(filePath, contents.slice(0, parameter.getStart(source)) + replacement + contents.slice(parameter.end), "utf-8");
}
