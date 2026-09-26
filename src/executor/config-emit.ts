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
    packageManager: config.packageManager,
    topology: config.topology,
    backend: config.backend,
    backendNotes: config.backend === "convex" ? "- Convex setup: see `CONVEX.md`." : "",
    auth: config.auth,
    i18nWeb,
    i18nMobile,
    uiWeb,
    uiMobile,
    locales: config.locales.join(", "),
    defaultLocale: config.defaultLocale,
    apps: config.apps.join(", "),
    runtime: config.runtime ?? "n/a",
    convexExample: config.convexExample ? "enabled" : "disabled",
    backendEnvironment:
      config.backend === "convex"
        ? [
            "# Convex (run the convex:dev script to configure a deployment)",
            "CONVEX_DEPLOYMENT=",
            ...(config.stacks.hasWeb ? ["NEXT_PUBLIC_CONVEX_URL="] : []),
            ...(config.stacks.hasMobile ? ["EXPO_PUBLIC_CONVEX_URL="] : []),
          ].join("\n")
        : "# REST backend\nAPI_BASE_URL=http://localhost:4000",
    authEnvironment:
      config.auth === "clerk"
        ? [
            "# Clerk",
            ...(config.stacks.hasWeb ? ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=", "CLERK_SECRET_KEY="] : []),
            ...(config.stacks.hasMobile ? ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="] : []),
            ...(config.backend === "convex" ? ["# Set CLERK_JWT_ISSUER_DOMAIN on the Convex deployment"] : []),
          ].join("\n")
        : "# Authentication disabled",
    i18nEnvironment:
      config.i18n.web || config.i18n.mobile !== "none"
        ? `# i18n\nDEFAULT_LOCALE=${config.defaultLocale}`
        : "# Internationalization disabled",
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
  if (config.topology === "monorepo" && config.backend === "convex") {
    const webVariables = [
      "NEXT_PUBLIC_CONVEX_URL=",
      ...(config.auth === "clerk"
        ? ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=", "CLERK_SECRET_KEY="]
        : []),
    ];
    const mobileVariables = [
      "EXPO_PUBLIC_CONVEX_URL=",
      ...(config.auth === "clerk" ? ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="] : []),
    ];
    writeFileSync(join(targetDir, "apps", "web", ".env.example"), `${webVariables.join("\n")}\n`);
    writeFileSync(join(targetDir, "apps", "mobile", ".env.example"), `${mobileVariables.join("\n")}\n`);
  }
}

export function emitProjectJson(config: NormalizedProjectConfig, targetDir: string): void {
  const { stacks: _stacks, apps, ...rest } = config;
  const serializable =
    config.topology === "monorepo" ? { ...rest, apps } : rest;
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
