import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type TemplateVars = Record<string, string>;

export function renderTemplate(content: string, vars: TemplateVars): string {
  return content.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? `{${key}}`);
}

export function writeRenderedFile(
  sourcePath: string,
  targetPath: string,
  vars: TemplateVars,
): void {
  const content = readFileSync(sourcePath, "utf-8");
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, renderTemplate(content, vars), "utf-8");
}

export function copyTemplateTree(
  sourceDir: string,
  targetDir: string,
  vars: TemplateVars,
): void {
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, entry);
    const stat = statSync(sourcePath);

    if (stat.isDirectory()) {
      copyTemplateTree(sourcePath, targetPath, vars);
      continue;
    }

    if (/\.(json|md|example|ts|tsx|js|mjs|css)$/.test(entry)) {
      writeRenderedFile(sourcePath, targetPath, vars);
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(sourcePath, targetPath);
  }
}
