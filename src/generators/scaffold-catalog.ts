import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeRenderedFile } from "./template.js";
import { templatesDir } from "../lib/paths.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";
import { buildRecipeVars } from "../executor/recipe-vars.js";

export type CatalogFieldType = "string" | "number" | "boolean" | "date";

export type CatalogField = {
  name: string;
  type: CatalogFieldType;
};

export type ScaffoldCatalogInput = {
  resourceSlug: string;
  fields: CatalogField[];
  archive: boolean;
  targetDir: string;
  config: NormalizedProjectConfig;
  force?: boolean;
  dryRun?: boolean;
};

export type ScaffoldCatalogResult =
  | { ok: true; files: string[] }
  | { ok: false; message: string };

const FIELD_TYPE_PATTERN = /^(string|number|boolean|date)$/;

export function parseCatalogFields(fieldsArg: string | undefined): CatalogField[] | null {
  if (!fieldsArg?.trim()) {
    return null;
  }

  const fields: CatalogField[] = [];

  for (const segment of fieldsArg.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      return null;
    }

    const name = trimmed.slice(0, colonIndex).trim();
    const type = trimmed.slice(colonIndex + 1).trim() as CatalogFieldType;

    if (!/^[a-z][a-z0-9]*$/i.test(name) || !FIELD_TYPE_PATTERN.test(type)) {
      return null;
    }

    fields.push({ name, type });
  }

  return fields.length > 0 ? fields : null;
}

function slugToPascal(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugToCamelNamespace(slug: string): string {
  const pascal = slugToPascal(slug);
  return `admin.${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}`;
}

function buildFieldEntries(fields: CatalogField[]): string {
  return fields.map((field) => `    ${field.name}: "${field.type}",`).join("\n");
}

function buildColumnsEntries(fields: CatalogField[]): string {
  return fields
    .map(
      (field) =>
        `    { key: "${field.name}", labelKey: "${field.name}", type: "${field.type}" },`,
    )
    .join("\n");
}

function buildArchiveHandlers(resourcePascal: string, archive: boolean): string {
  if (!archive) {
    return "";
  }

  return `export async function archive${resourcePascal}(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  void request;
  return Response.json({ id, archived: true });
}

export async function restore${resourcePascal}(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  void request;
  return Response.json({ id, archived: false });
}
`;
}

export function scaffoldCatalogResource(input: ScaffoldCatalogInput): ScaffoldCatalogResult {
  const { resourceSlug, fields, archive, targetDir, config } = input;

  if (!/^[a-z][a-z0-9-]*$/.test(resourceSlug)) {
    return { ok: false, message: "Resource slug must be kebab-case (e.g. billing-types)." };
  }

  if (!config.modules.includes("admin-catalog")) {
    return {
      ok: false,
      message: 'project.json must include "admin-catalog" in modules[] — run init with admin-catalog or add-module.',
    };
  }

  const vars = {
    ...buildRecipeVars(config),
    resourceSlug,
    resourcePascal: slugToPascal(resourceSlug),
    resourceTitle: slugToTitle(resourceSlug),
    resourceTitleFr: slugToTitle(resourceSlug),
    apiPath: `/api/admin/${resourceSlug}`,
    i18nNamespace: slugToCamelNamespace(resourceSlug),
    fieldEntries: buildFieldEntries(fields),
    columnsEntries: buildColumnsEntries(fields),
    archiveFlag: archive ? "true" : "false",
    archiveHandlers: buildArchiveHandlers(slugToPascal(resourceSlug), archive),
  };

  const files: string[] = [];
  const templateRoot = templatesDir();

  const resourceConfigPath = join(
    targetDir,
    "packages",
    "core",
    "src",
    "admin-catalog",
    "resources",
    `${resourceSlug}.ts`,
  );
  const plannedFiles = [resourceConfigPath];
  if (config.stacks.hasWeb) {
    plannedFiles.push(
      join(targetDir, "apps", "web", "app", "admin", resourceSlug, "page.tsx"),
      join(
        targetDir,
        "apps",
        "web",
        "app",
        "api",
        "admin",
        resourceSlug,
        "route.ts",
      ),
      ...config.locales.map((locale) =>
        join(targetDir, "apps", "web", "locales", locale, `${resourceSlug}.json`),
      ),
    );
  }

  const collisions = plannedFiles.filter((file) => existsSync(file));
  if (collisions.length > 0 && !input.force) {
    return {
      ok: false,
      message: `Unsafe catalog collisions: ${collisions.join(", ")}`,
    };
  }
  if (input.dryRun) {
    return { ok: true, files: plannedFiles };
  }

  mkdirSync(join(targetDir, "packages", "core", "src", "admin-catalog", "resources"), {
    recursive: true,
  });
  writeRenderedFile(
    join(templateRoot, "scaffold", "catalog-resource-config.ts"),
    resourceConfigPath,
    vars,
  );
  files.push(resourceConfigPath);

  if (config.stacks.hasWeb) {
    const adminPagePath = join(
      targetDir,
      "apps",
      "web",
      "app",
      "admin",
      resourceSlug,
      "page.tsx",
    );
    mkdirSync(join(targetDir, "apps", "web", "app", "admin", resourceSlug), { recursive: true });
    writeRenderedFile(
      join(templateRoot, "scaffold", "catalog-admin-page.tsx"),
      adminPagePath,
      vars,
    );
    files.push(adminPagePath);

    const apiRoutePath = join(
      targetDir,
      "apps",
      "web",
      "app",
      "api",
      "admin",
      resourceSlug,
      "route.ts",
    );
    mkdirSync(join(targetDir, "apps", "web", "app", "api", "admin", resourceSlug), {
      recursive: true,
    });
    writeRenderedFile(
      join(templateRoot, "scaffold", "catalog-server-route.ts"),
      apiRoutePath,
      vars,
    );
    files.push(apiRoutePath);

    for (const locale of config.locales) {
      const localeDir = join(targetDir, "apps", "web", "locales", locale);
      if (!existsSync(localeDir)) {
        mkdirSync(localeDir, { recursive: true });
      }
      const i18nTemplate =
        locale === "fr" ? "catalog-i18n-fr.json" : "catalog-i18n-en.json";
      const i18nPath = join(localeDir, `${resourceSlug}.json`);
      writeRenderedFile(join(templateRoot, "scaffold", i18nTemplate), i18nPath, vars);
      files.push(i18nPath);
    }
  }

  return { ok: true, files };
}
