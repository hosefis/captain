import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type TemplateVariables = Record<string, string>;

/** Substitute known template placeholders while retaining unrecognized placeholders. */
export function renderTemplate(content: string, variables: TemplateVariables): string {
  return content.replace(/\{(\w+)\}/g, (_match, key: string) => variables[key] ?? `{${key}}`);
}

/** Render a template file and create its destination directories as needed. */
export function writeRenderedFile(
  sourcePath: string,
  targetPath: string,
  variables: TemplateVariables,
): void {
  const content = readFileSync(sourcePath, "utf-8");
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, renderTemplate(content, variables), "utf-8");
}

/** Copy a recipe tree, rendering supported text files and preserving other bytes. */
export function copyTemplateTree(
  sourceDirectory: string,
  targetDirectory: string,
  variables: TemplateVariables,
): void {
  for (const entry of readdirSync(sourceDirectory)) {
    const sourcePath = join(sourceDirectory, entry);
    const targetPath = join(targetDirectory, entry);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      copyTemplateTree(sourcePath, targetPath, variables);
      continue;
    }

    if (/\.(json|md|example|ts|tsx|js|mjs|css)$/.test(entry)) {
      writeRenderedFile(sourcePath, targetPath, variables);
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
}
