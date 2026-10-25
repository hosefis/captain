import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeRenderedFile } from "../generators/template.js";
import { templatesDirectory } from "../lib/paths.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";
import { emitAgentGuidance } from "./agent-guidance.js";

function templateVariables(config: NormalizedProjectConfig): Record<string, string> {
  const webInternationalization = config.i18n.web ?? "—";
  const mobileInternationalization = config.i18n.mobile ?? "—";
  const webUserInterface = config.ui.web ?? "—";
  const mobileUserInterface = config.ui.mobile ?? "—";

  return {
    name: config.name,
    scope: config.scope,
    packageManager: config.packageManager,
    topology: config.topology,
    backend: config.backend,
    backendNotes: config.backend === "convex" ? "- Convex setup: see `CONVEX.md`." : "",
    auth: config.auth,
    i18nWeb: webInternationalization,
    i18nMobile: mobileInternationalization,
    uiWeb: webUserInterface,
    uiMobile: mobileUserInterface,
    locales: config.locales.join(", "),
    defaultLocale: config.defaultLocale,
    apps: config.apps.join(", "),
    runtime: config.runtime ?? "n/a",
    convexExample: config.convexExample ? "enabled" : "disabled",
    codeStandards: config.enforceCodeStandards ? "enabled" : "guidance only",
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

/** Writes onboarding notes describing the selected project stack. */
export function emitProjectContext(config: NormalizedProjectConfig, targetDirectory: string): void {
  writeRenderedFile(
    join(templatesDirectory(), "CONTEXT.md"),
    join(targetDirectory, "CONTEXT.md"),
    templateVariables(config),
  );
}

/** Writes environment placeholders for the selected integrations and applications. */
export function emitEnvironmentExample(config: NormalizedProjectConfig, targetDirectory: string): void {
  writeRenderedFile(
    join(templatesDirectory(), "env.example"),
    join(targetDirectory, ".env.example"),
    templateVariables(config),
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
    writeFileSync(join(targetDirectory, "apps", "web", ".env.example"), `${webVariables.join("\n")}\n`);
    writeFileSync(join(targetDirectory, "apps", "mobile", ".env.example"), `${mobileVariables.join("\n")}\n`);
  }
}

/** Writes project onboarding documentation and environment variable examples. */
export function applyConfigEmit(config: NormalizedProjectConfig, targetDirectory: string): void {
  emitAgentGuidance(targetDirectory);
  emitProjectContext(config, targetDirectory);
  emitEnvironmentExample(config, targetDirectory);
}
