#!/usr/bin/env node
import { readdirSync, realpathSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import typescript from "typescript";

const excludedDirectories = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".expo",
  ".turbo", "coverage", ".output", ".vercel", ".netlify", ".yarn",
]);
const sourceExtensions = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"]);

function isExcluded(directory) {
  const segments = directory.split(/[\\/]/);
  if (segments.some((segment) => excludedDirectories.has(segment))) return true;
  const convexIndex = segments.indexOf("convex");
  return convexIndex !== -1 && segments.indexOf("_generated", convexIndex) !== -1;
}

function collectFiles(entry, files, visitedDirectories) {
  if (isExcluded(entry)) return;
  const canonicalPath = realpathSync(entry);
  if (isExcluded(canonicalPath)) return;
  if (!statSync(entry).isDirectory()) {
    if (sourceExtensions.has(extname(entry))) files.add(entry);
    return;
  }
  if (visitedDirectories.has(canonicalPath)) return;
  visitedDirectories.add(canonicalPath);
  for (const child of readdirSync(entry, { withFileTypes: true })) {
    collectFiles(join(entry, child.name), files, visitedDirectories);
  }
}

function hasIntentDocumentation(node) {
  if (!node) return false;
  const attached = typescript.getJSDocCommentsAndTags(node).some((documentation) => {
    if (!typescript.isJSDoc(documentation)) return false;
    const comment = documentation.comment;
    if (typeof comment === "string") return comment.trim().length > 0;
    return comment?.some((part) => part.text?.trim().length > 0) ?? false;
  });
  if (attached) return true;
  const source = node.getSourceFile().text;
  const comments = [
    ...(typescript.getLeadingCommentRanges(source, node.pos) ?? []),
    ...(typescript.getTrailingCommentRanges(source, node.pos) ?? []),
  ];
  return comments.some((comment) => {
    const text = source.slice(comment.pos, comment.end);
    if (!text.startsWith("/**")) return false;
    const intent = text.slice(3, -2).replace(/^\s*\*\s?/gm, "").trim();
    return intent.length > 0 && !intent.startsWith("@");
  });
}

function documentationOwner(node) {
  if (typescript.isVariableDeclaration(node)) return node.parent.parent;
  if (typescript.isBinaryExpression(node) && typescript.isExpressionStatement(node.parent)) return node.parent;
  return node;
}

function isPrivate(node) {
  return (node.name && typescript.isPrivateIdentifier(node.name)) ||
    node.modifiers?.some((modifier) => modifier.kind === typescript.SyntaxKind.PrivateKeyword ||
      modifier.kind === typescript.SyntaxKind.ProtectedKeyword);
}

function isCallable(checker, node) {
  const value = checker.getTypeAtLocation(node);
  return value.getCallSignatures().length > 0 || value.getConstructSignatures().length > 0;
}

function isImportedBinding(node, checker, visited = new Set()) {
  if (!node || visited.has(node)) return false;
  visited.add(node);
  if (typescript.isCallExpression(node)) return node.expression.getText() === "require";
  if (typescript.isPropertyAccessExpression(node) || typescript.isElementAccessExpression(node) ||
      typescript.isParenthesizedExpression(node)) return isImportedBinding(node.expression, checker, visited);
  const symbol = checker.getSymbolAtLocation(node);
  return symbol?.declarations?.some((declaration) => {
    if (typescript.isImportSpecifier(declaration) || typescript.isImportClause(declaration) ||
        typescript.isNamespaceImport(declaration) || typescript.isImportEqualsDeclaration(declaration)) return true;
    if (typescript.isVariableDeclaration(declaration)) return isImportedBinding(declaration.initializer, checker, visited);
    if (!typescript.isBindingElement(declaration)) return false;
    let binding = declaration.parent;
    while (binding && !typescript.isVariableDeclaration(binding)) binding = binding.parent;
    return isImportedBinding(binding?.initializer, checker, visited);
  }) ?? false;
}

function hasReferencedIntentDocumentation(node, checker, visited = new Set()) {
  if (!node || visited.has(node)) return false;
  visited.add(node);
  const reference = typescript.isPropertyAssignment(node) ? node.initializer : node;
  const symbol = typescript.isShorthandPropertyAssignment(node)
    ? checker.getShorthandAssignmentValueSymbol(node)
    : typescript.isIdentifier(reference) && checker.getSymbolAtLocation(reference);
  return symbol?.declarations?.some((declaration) =>
    hasIntentDocumentation(documentationOwner(declaration)) ||
    (typescript.isVariableDeclaration(declaration) && hasReferencedIntentDocumentation(declaration.initializer, checker, visited))) ?? false;
}

function isControlFlow(node) {
  return typescript.isIfStatement(node) || typescript.isForStatement(node) ||
    typescript.isForOfStatement(node) || typescript.isForInStatement(node) ||
    typescript.isWhileStatement(node) || typescript.isDoStatement(node) ||
    typescript.isSwitchStatement(node) || typescript.isCatchClause(node) ||
    typescript.isConditionalExpression(node);
}

function inspectNesting(source, report) {
  function visit(node, depth) {
    if (typescript.isFunctionLike(node)) depth = 0;
    const isElseIf = typescript.isIfStatement(node) && typescript.isIfStatement(node.parent) &&
      node.parent.elseStatement === node;
    const nextDepth = depth + (isControlFlow(node) && !isElseIf ? 1 : 0);
    if (nextDepth > 3 && nextDepth !== depth) {
      report(node, "warning", "nesting", `Control-flow nesting is ${nextDepth}; prefer at most 3 levels.`);
    }
    typescript.forEachChild(node, (child) => visit(child, nextDepth));
  }
  visit(source, 0);
}

function inspectPublicDeclarations(source, checker, report) {
  const inspected = new Set();
  const reported = new Set();

  function requireDocumentation(node, alternate) {
    if (hasIntentDocumentation(documentationOwner(node)) || hasIntentDocumentation(alternate)) return;
    if (hasReferencedIntentDocumentation(node, checker)) return;
    const symbol = node.name && checker.getSymbolAtLocation(node.name);
    if (symbol?.declarations?.some((declaration) => hasIntentDocumentation(documentationOwner(declaration)))) return;
    const owner = alternate ?? documentationOwner(node);
    if (reported.has(owner)) return;
    reported.add(owner);
    const name = node.name?.getText(source) ?? "public API";
    report(node, "error", "public-documentation", `Missing intent documentation for ${name}.`);
  }

  function inspect(node, alternate) {
    if (!node || inspected.has(node) || node.getSourceFile() !== source || isPrivate(node)) return;
    if (typescript.isImportSpecifier(node) || typescript.isImportClause(node) ||
        typescript.isNamespaceImport(node)) return;
    inspected.add(node);
    if (typescript.isIdentifier(node) || typescript.isTypeReferenceNode(node)) {
      const symbol = checker.getSymbolAtLocation(node.typeName ?? node);
      for (const declaration of symbol?.declarations ?? []) inspect(declaration, alternate);
      return;
    }
    if (typescript.isFunctionLike(node) || typescript.isClassLike(node) ||
        typescript.isFunctionTypeNode(node) || isCallable(checker, node)) {
      requireDocumentation(node, alternate);
    }
    if (node.members) {
      for (const member of node.members) inspect(member);
    }
    if (typescript.isObjectLiteralExpression(node)) {
      for (const property of node.properties) inspect(property);
    }
    if (node.type) inspect(node.type, documentationOwner(node));
    if (node.initializer) inspect(node.initializer, documentationOwner(node));
    if (typescript.isVariableDeclaration(node) || typescript.isCallExpression(node)) {
      for (const property of checker.getTypeAtLocation(node).getProperties()) {
        for (const declaration of property.declarations ?? []) inspect(declaration);
      }
    }
    if (typescript.isShorthandPropertyAssignment(node)) inspect(node.name, node);
    if (typescript.isParenthesizedExpression(node) || typescript.isAsExpression(node) ||
        typescript.isSatisfiesExpression(node)) inspect(node.expression, alternate);
    if (typescript.isUnionTypeNode(node) || typescript.isIntersectionTypeNode(node)) {
      for (const member of node.types) inspect(member, alternate);
    }
  }

  const moduleSymbol = checker.getSymbolAtLocation(source);
  for (const symbol of moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : []) {
    const resolved = symbol.flags & typescript.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    for (const declaration of resolved.declarations ?? []) inspect(declaration);
  }

  function visit(node) {
    if (typescript.isExportDeclaration(node) && node.moduleSpecifier) {
      report(node, "error", "barrel", "Import from the defining module instead of re-exporting it.");
    }
    if (typescript.isExportSpecifier(node)) {
      const symbol = checker.getExportSpecifierLocalTargetSymbol(node);
      if (symbol?.declarations?.some((declaration) => typescript.isImportSpecifier(declaration) ||
          typescript.isImportClause(declaration) || typescript.isNamespaceImport(declaration))) {
        report(node, "error", "barrel", "Import from the defining module instead of re-exporting an import.");
      }
    }
    if (typescript.isExportAssignment(node)) {
      if (isImportedBinding(node.expression, checker)) {
        report(node, "error", "barrel", "Import from the defining module instead of re-exporting an import.");
      }
      inspect(node.expression, node);
    }
    if (typescript.getCombinedModifierFlags(node) & typescript.ModifierFlags.Export) inspect(node);
    if (typescript.isBinaryExpression(node) && node.operatorToken.kind === typescript.SyntaxKind.EqualsToken) {
      const target = node.left.getText(source);
      if (/^(?:module\.exports|exports)(?:\.|\[|$)/.test(target)) {
        if (isImportedBinding(node.right, checker)) {
          report(node, "error", "barrel", "Import from the defining module instead of re-exporting it.");
        }
        inspect(node.right, documentationOwner(node));
      }
    }
    typescript.forEachChild(node, visit);
  }
  visit(source);
}

/** Check maintained JavaScript and TypeScript roots and return diagnostics without changing files. */
export function checkCodeStandards(roots = [process.cwd()]) {
  const files = new Set();
  const visitedDirectories = new Set();
  for (const root of roots) collectFiles(resolve(root), files, visitedDirectories);
  const program = typescript.createProgram([...files].sort(), {
    allowJs: true,
    noEmit: true,
    target: typescript.ScriptTarget.Latest,
    module: typescript.ModuleKind.NodeNext,
    moduleResolution: typescript.ModuleResolutionKind.NodeNext,
    jsx: typescript.JsxEmit.Preserve,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const diagnostics = [];
  for (const file of [...files].sort()) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    const report = (node, severity, rule, message) => {
      const location = source.getLineAndCharacterOfPosition(node.getStart(source));
      diagnostics.push({ file, line: location.line + 1, column: location.character + 1, severity, rule, message });
    };
    inspectPublicDeclarations(source, checker, report);
    inspectNesting(source, report);
  }
  return diagnostics;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const roots = process.argv.slice(2);
    const diagnostics = checkCodeStandards(roots.length ? roots : undefined);
    for (const diagnostic of diagnostics) {
      console.log(`${relative(process.cwd(), diagnostic.file)}:${diagnostic.line}:${diagnostic.column} ${diagnostic.severity} [${diagnostic.rule}] ${diagnostic.message}`);
    }
    const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
    const warnings = diagnostics.length - errors;
    console.log(`Code standards: ${errors} error(s), ${warnings} warning(s).`);
    process.exitCode = errors ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
