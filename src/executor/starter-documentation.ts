import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { createRequire } from "node:module";
import type ts from "typescript";

const ignoredDirectories = new Set([
  "node_modules", ".git", ".next", ".expo", ".turbo", "dist", "build", "out", "coverage",
  ".output", ".vercel", ".netlify", ".yarn",
]);

const starterFiles = new Set([
  "page.tsx", "layout.tsx", "_layout.tsx", "index.tsx", "explore.tsx", "modal.tsx",
  "hello-wave.tsx", "animated-icon.tsx", "animated-icon.web.tsx", "app-tabs.tsx", "app-tabs.web.tsx",
  "external-link.tsx", "hint-row.tsx", "themed-text.tsx", "themed-view.tsx", "parallax-scroll-view.tsx",
  "haptic-tab.tsx", "collapsible.tsx", "icon-symbol.tsx", "icon-symbol.ios.tsx", "web-badge.tsx",
  "use-color-scheme.ts", "use-color-scheme.web.ts", "use-theme.ts", "use-theme-color.ts",
  "theme.ts", "Colors.ts", "button.tsx", "card.tsx", "code.tsx",
]);

const turboLintPresets: Record<string, { subpath: string; sourceName: string; presetName: string }> = {
  "packages/ui/eslint.config.mjs": { subpath: "./react-internal", sourceName: "react-internal.js", presetName: "config" },
  "apps/docs/eslint.config.js": { subpath: "./next-js", sourceName: "next.js", presetName: "nextJsConfig" },
};

const intentByName: Record<string, string> = {
  Home: "Displays the application's starter home page.",
  HomeScreen: "Displays the starter home screen and development instructions.",
  Page: "Displays the application's starter landing page.",
  RootLayout: "Provides the document shell and shared application layout.",
  Layout: "Provides the shared layout around application routes.",
  TabLayout: "Configures navigation between the application tabs.",
  TabTwoScreen: "Displays the starter exploration screen and feature examples.",
  ModalScreen: "Displays the starter modal route and its return navigation.",
  AnimatedSplashOverlay: "Displays the animated splash overlay while the application becomes ready.",
  AnimatedIcon: "Displays the animated application icon.",
  HelloWave: "Displays the animated greeting used on the starter home screen.",
  AppTabs: "Provides platform-specific navigation for the application tabs.",
  TabButton: "Displays a navigation tab and its focused state.",
  CustomTabList: "Arranges the application's web navigation tabs.",
  ExternalLink: "Opens an external URL using the platform's supported browser behavior.",
  HintRow: "Displays a starter development hint and its suggested file.",
  ThemedText: "Displays text using the selected application theme and text style.",
  ThemedTextProps: "Text properties and theme overrides accepted by ThemedText.",
  ThemedView: "Displays a view using the selected application theme.",
  ThemedViewProps: "View properties and background overrides accepted by ThemedView.",
  ParallaxScrollView: "Displays scrollable content beneath an animated parallax header.",
  HapticTab: "Provides tab press feedback using the platform's haptic support.",
  Collapsible: "Displays a titled section whose contents can be expanded or collapsed.",
  IconSymbol: "Displays a platform-appropriate symbol for the requested icon name.",
  WebBadge: "Displays the starter application's web attribution badge.",
  useColorScheme: "Returns the platform color scheme after web hydration when applicable.",
  useTheme: "Returns the application theme for the current color scheme.",
  useThemeColor: "Resolves a theme color with optional light and dark overrides.",
  Colors: "Application color palettes for light and dark appearances.",
  ThemeColor: "Color names shared by the application's light and dark palettes.",
  Fonts: "Platform-specific font families used by the application theme.",
  Spacing: "Shared spacing values for application layouts.",
  BottomTabInset: "Platform-specific space reserved beneath the application tab bar.",
  MaxContentWidth: "Maximum content width used by the starter application layout.",
  Button: "Displays the shared button with application-specific click feedback.",
  ButtonProps: "Content and appearance accepted by the shared application button.",
  Card: "Displays a linked card with a title and supporting content.",
  Code: "Displays code using the shared monospace presentation.",
  metadata: "Page metadata exposed by the starter application.",
  unstable_settings: "Expo Router settings controlling the starter navigation entry point.",
};

function exportedName(statement: ts.Statement, compiler: typeof ts): string | undefined {
  if (compiler.isFunctionDeclaration(statement) || compiler.isTypeAliasDeclaration(statement) || compiler.isInterfaceDeclaration(statement)) {
    return statement.name?.text;
  }
  if (compiler.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
    const name = statement.declarationList.declarations[0]!.name;
    return compiler.isIdentifier(name) ? name.text : undefined;
  }
  return undefined;
}

function isColorSchemeForward(statement: ts.Statement, compiler: typeof ts): boolean {
  if (!compiler.isExportDeclaration(statement) || !statement.moduleSpecifier || !compiler.isStringLiteral(statement.moduleSpecifier)) return false;
  if (statement.isTypeOnly) return false;
  if (statement.moduleSpecifier.text !== "react-native" || !statement.exportClause || !compiler.isNamedExports(statement.exportClause)) return false;
  const exports = statement.exportClause.elements;
  return exports.length === 1 && exports[0]!.name.text === "useColorScheme" && !exports[0]!.propertyName && !exports[0]!.isTypeOnly;
}

function turboPresetForward(filePath: string, directory: string, source: ts.SourceFile, compiler: typeof ts): ts.ExportAssignment | undefined {
  const relativePath = relative(directory, filePath).replace(/\\/g, "/");
  const preset = Object.hasOwn(turboLintPresets, relativePath) ? turboLintPresets[relativePath] : undefined;
  if (!preset || source.statements.length !== 2) return undefined;
  const [imported, exported] = source.statements;
  if (!imported || !compiler.isImportDeclaration(imported) || !compiler.isStringLiteral(imported.moduleSpecifier)) return undefined;
  if (imported.moduleSpecifier.text !== `@repo/eslint-config/${preset.subpath.slice(2)}` || imported.importClause?.isTypeOnly || imported.importClause?.name) return undefined;
  const bindings = imported.importClause?.namedBindings;
  if (!bindings || !compiler.isNamedImports(bindings) || bindings.elements.length !== 1) return undefined;
  const binding = bindings.elements[0]!;
  if (binding.name.text !== preset.presetName || binding.propertyName || binding.isTypeOnly) return undefined;
  if (!exported || !compiler.isExportAssignment(exported) || exported.isExportEquals) return undefined;
  if (!compiler.isIdentifier(exported.expression) || exported.expression.text !== preset.presetName) return undefined;

  const providerDirectory = join(directory, "packages/eslint-config");
  const manifestPath = join(providerDirectory, "package.json");
  const providerPath = join(providerDirectory, preset.sourceName);
  if (!existsSync(manifestPath) || !existsSync(providerPath)) return undefined;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as { name?: string; exports?: Record<string, unknown> };
  if (manifest.name !== "@repo/eslint-config" || manifest.exports?.[preset.subpath] !== `./${preset.sourceName}`) return undefined;
  const provider = compiler.createSourceFile(providerPath, readFileSync(providerPath, "utf-8"), compiler.ScriptTarget.Latest, true);
  const exportsArray = provider.statements.some((statement) => {
    if (!compiler.isVariableStatement(statement) || !statement.modifiers?.some((modifier) => modifier.kind === compiler.SyntaxKind.ExportKeyword)) return false;
    if (!(statement.declarationList.flags & compiler.NodeFlags.Const)) return false;
    return statement.declarationList.declarations.some((declaration) =>
      compiler.isIdentifier(declaration.name) && declaration.name.text === preset.presetName &&
      declaration.initializer !== undefined && compiler.isArrayLiteralExpression(declaration.initializer));
  });
  return exportsArray ? exported : undefined;
}

function documentFile(filePath: string, compiler: typeof ts, directory: string): void {
  const contents = readFileSync(filePath, "utf-8");
  const source = compiler.createSourceFile(filePath, contents, compiler.ScriptTarget.Latest, true);
  if (Object.hasOwn(turboLintPresets, relative(directory, filePath).replace(/\\/g, "/"))) {
    const forwardedPreset = turboPresetForward(filePath, directory, source, compiler);
    if (!forwardedPreset) return;
    const expression = forwardedPreset.expression;
    const prepared = contents.slice(0, expression.getStart(source)) + `[...${expression.getText(source)}]` + contents.slice(expression.end);
    writeFileSync(filePath, prepared, "utf-8");
    return;
  }
  const insertions: Array<{ start: number; end: number; text: string }> = [];
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";

  for (const statement of source.statements) {
    if (basename(filePath) === "use-color-scheme.ts" && source.statements.length === 1 && isColorSchemeForward(statement, compiler)) {
      insertions.push({
        start: statement.getStart(source), end: statement.end,
        text: `import { useColorScheme as useNativeColorScheme } from "react-native";${newline}${newline}/** Returns the native platform's current color scheme. */${newline}export function useColorScheme() {${newline}  return useNativeColorScheme();${newline}}`,
      });
      continue;
    }
    if (!compiler.canHaveModifiers(statement) || !compiler.getModifiers(statement)?.some((modifier) => modifier.kind === compiler.SyntaxKind.ExportKeyword)) continue;
    const name = exportedName(statement, compiler);
    const intent = name ? intentByName[name] : undefined;
    if (!intent || compiler.getJSDocCommentsAndTags(statement).length > 0) continue;
    insertions.push({ start: statement.getStart(source), end: statement.getStart(source), text: `/** ${intent} */${newline}` });
  }

  let documented = contents;
  for (const insertion of insertions.reverse()) {
    documented = documented.slice(0, insertion.start) + insertion.text + documented.slice(insertion.end);
  }
  if (documented !== contents) writeFileSync(filePath, documented, "utf-8");
}

/** Finds editable framework starter files before integration recipes emit their own documented source. */
export function findStarterSourceFiles(directory: string): string[] {
  const files: string[] = [];
  const visit = (currentDirectory: string): void => {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      if (entry.name === "_generated" && currentDirectory.split(/[\\/]/).includes("convex")) continue;
      const filePath = join(currentDirectory, entry.name);
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) visit(filePath);
      const relativePath = relative(directory, filePath).replace(/\\/g, "/");
      if (entry.isFile() && (starterFiles.has(entry.name) || Object.hasOwn(turboLintPresets, relativePath))) files.push(filePath);
    }
  };
  visit(directory);
  return files;
}

/** Prepares recognized starter exports and composes Turbo lint presets using the installed compiler when needed. */
export function documentStarterSource(
  directory: string,
  compiler?: typeof ts,
  sourceFiles: readonly string[] = findStarterSourceFiles(directory),
): void {
  if (sourceFiles.length === 0) return;
  const installedCompiler = compiler ?? createRequire(join(directory, "package.json"))("typescript") as typeof ts;
  for (const filePath of sourceFiles) documentFile(filePath, installedCompiler, directory);
}
