import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeRenderedFile } from "../generators/template.js";
import { templatesDir } from "../lib/paths.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";

function templateVars(config: NormalizedProjectConfig): Record<string, string> {
  const i18nWeb = config.i18n.web ?? "—";
  const i18nMobile = config.i18n.mobile ?? "—";
  const uiWeb = config.ui.web ?? "—";
  const uiMobile = config.ui.mobile ?? "—";

  return {
    name: config.name,
    scope: config.scope,
    topology: config.topology,
    backend: config.backend,
    auth: config.auth,
    i18nWeb,
    i18nMobile,
    uiWeb,
    uiMobile,
    locales: config.locales.join(", "),
    defaultLocale: config.defaultLocale,
    modules: config.modules.join(", "),
    apps: config.apps.join(", "),
    runtime: config.runtime ?? "n/a",
  };
}

export function emitContextMd(config: NormalizedProjectConfig, targetDir: string): void {
  writeRenderedFile(
    join(templatesDir(), "CONTEXT.md"),
    join(targetDir, "CONTEXT.md"),
    templateVars(config),
  );
}

export function emitEnvExample(config: NormalizedProjectConfig, targetDir: string): void {
  writeRenderedFile(
    join(templatesDir(), "env.example"),
    join(targetDir, ".env.example"),
    templateVars(config),
  );
}

export function emitProjectJson(config: NormalizedProjectConfig, targetDir: string): void {
  const { stacks: _stacks, ...serializable } = config;
  writeFileSync(
    join(targetDir, "project.json"),
    `${JSON.stringify(serializable, null, 2)}\n`,
    "utf-8",
  );
}

export function applyConfigEmit(config: NormalizedProjectConfig, targetDir: string): void {
  emitContextMd(config, targetDir);
  emitEnvExample(config, targetDir);
  emitProjectJson(config, targetDir);
}
