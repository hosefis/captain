import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeRenderedFile } from "../generators/template.js";
import { templatesDirectory } from "../lib/paths.js";
import type { NormalizedProjectConfiguration } from "../schema/project-configuration.js";
import { emitAgentGuidance } from "./agent-guidance.js";

function templateVariables(configuration: NormalizedProjectConfiguration): Record<string, string> {
  const webInternationalization = configuration.i18n.web ?? "—";
  const mobileInternationalization = configuration.i18n.mobile ?? "—";
  const webUserInterface = configuration.ui.web ?? "—";
  const mobileUserInterface = configuration.ui.mobile ?? "—";

  return {
    name: configuration.name,
    scope: configuration.scope,
    packageManager: configuration.packageManager,
    topology: configuration.topology,
    backend: configuration.backend,
    backendNotes: configuration.backend === "convex" ? "- Convex setup: see `CONVEX.md`." : "",
    auth: configuration.auth,
    webInternationalization,
    mobileInternationalization,
    webUserInterface,
    mobileUserInterface,
    locales: configuration.locales.join(", "),
    defaultLocale: configuration.defaultLocale,
    apps: configuration.apps.join(", "),
    runtime: configuration.runtime ?? "n/a",
    convexExample: configuration.convexExample ? "enabled" : "disabled",
    codeStandards: configuration.enforceCodeStandards ? "enabled" : "guidance only",
    backendEnvironment:
      configuration.backend === "convex"
        ? [
            "# Convex (run the convex:dev script to configure a deployment)",
            "CONVEX_DEPLOYMENT=",
            ...(configuration.stacks.hasWeb ? ["NEXT_PUBLIC_CONVEX_URL="] : []),
            ...(configuration.stacks.hasMobile ? ["EXPO_PUBLIC_CONVEX_URL="] : []),
          ].join("\n")
        : "# REST backend\nAPI_BASE_URL=http://localhost:4000",
    authenticationEnvironment:
      configuration.auth === "clerk"
        ? [
            "# Clerk",
            ...(configuration.stacks.hasWeb ? ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=", "CLERK_SECRET_KEY="] : []),
            ...(configuration.stacks.hasMobile ? ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="] : []),
            ...(configuration.backend === "convex" ? ["# Set CLERK_JWT_ISSUER_DOMAIN on the Convex deployment"] : []),
          ].join("\n")
        : "# Authentication disabled",
    internationalizationEnvironment:
      configuration.i18n.web || configuration.i18n.mobile !== "none"
        ? `# i18n\nDEFAULT_LOCALE=${configuration.defaultLocale}`
        : "# Internationalization disabled",
  };
}

/** Writes onboarding notes describing the selected project stack. */
export function emitProjectContext(configuration: NormalizedProjectConfiguration, targetDirectory: string): void {
  writeRenderedFile(
    join(templatesDirectory(), "CONTEXT.md"),
    join(targetDirectory, "CONTEXT.md"),
    templateVariables(configuration),
  );
}

/** Writes environment placeholders for the selected integrations and applications. */
export function emitEnvironmentExample(configuration: NormalizedProjectConfiguration, targetDirectory: string): void {
  writeRenderedFile(
    join(templatesDirectory(), "env.example"),
    join(targetDirectory, ".env.example"),
    templateVariables(configuration),
  );
  if (configuration.topology === "monorepo" && configuration.backend === "convex") {
    const webVariables = [
      "NEXT_PUBLIC_CONVEX_URL=",
      ...(configuration.auth === "clerk"
        ? ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=", "CLERK_SECRET_KEY="]
        : []),
    ];
    const mobileVariables = [
      "EXPO_PUBLIC_CONVEX_URL=",
      ...(configuration.auth === "clerk" ? ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY="] : []),
    ];
    writeFileSync(join(targetDirectory, "apps", "web", ".env.example"), `${webVariables.join("\n")}\n`);
    writeFileSync(join(targetDirectory, "apps", "mobile", ".env.example"), `${mobileVariables.join("\n")}\n`);
  }
}

/** Writes project onboarding documentation and environment variable examples. */
export function emitProjectGuidance(configuration: NormalizedProjectConfiguration, targetDirectory: string): void {
  emitAgentGuidance(targetDirectory);
  emitProjectContext(configuration, targetDirectory);
  emitEnvironmentExample(configuration, targetDirectory);
}
