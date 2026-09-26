import { readFileSync } from "node:fs";
import path from "node:path";
import { toJSONSchema, z } from "zod";
import {
  optionValues,
  SUPPORTED_OPTIONS,
} from "../supported-options.js";

export const packageManagerSchema = z.enum(
  optionValues(SUPPORTED_OPTIONS.packageManagers),
);
export const topologySchema = z.enum(optionValues(SUPPORTED_OPTIONS.topologies));
export const appSchema = z.enum(["web", "mobile"]);
export const backendSchema = z.enum(optionValues(SUPPORTED_OPTIONS.backends));
export const authSchema = z.enum(
  optionValues(SUPPORTED_OPTIONS.authentication),
);
export const i18nWebSchema = z.enum(optionValues(SUPPORTED_OPTIONS.webI18n));
export const i18nMobileSchema = z.enum(
  optionValues(SUPPORTED_OPTIONS.mobileI18n),
);
export const uiWebSchema = z.enum(optionValues(SUPPORTED_OPTIONS.webUi));
export const uiMobileSchema = z.enum(optionValues(SUPPORTED_OPTIONS.mobileUi));
export const expoRuntimeSchema = z.enum(
  optionValues(SUPPORTED_OPTIONS.runtimes),
);

const scopeSchema = z
  .string()
  .regex(/^@[a-z0-9-]+$/i, "scope must be an npm scope like @acme");

const i18nStackSchema = z.object({
  web: i18nWebSchema.optional(),
  mobile: i18nMobileSchema.optional(),
});

const uiStackSchema = z.object({
  web: uiWebSchema.optional(),
  mobile: uiMobileSchema.optional(),
});

const i18nInputSchema = z.union([i18nWebSchema, i18nMobileSchema, i18nStackSchema]);
const uiInputSchema = z.union([uiWebSchema, uiMobileSchema, uiStackSchema]);

export const projectConfigSchema = z
  .object({
    $schema: z.string().optional(),
    name: z
      .string()
      .min(1)
      .regex(/^[a-z0-9-]+$/i, "name must be kebab-case"),
    scope: scopeSchema,
    packageManager: packageManagerSchema.default("pnpm"),
    topology: topologySchema,
    apps: z.array(appSchema).optional(),
    backend: backendSchema.default("rest"),
    convexExample: z.boolean().default(false),
    auth: authSchema.default("clerk"),
    i18n: i18nInputSchema,
    ui: uiInputSchema,
    locales: z.array(z.string().min(2)).min(1).default(["en", "fr"]),
    defaultLocale: z.string().min(2).default("en"),
    runtime: expoRuntimeSchema.optional(),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.convexExample && config.backend !== "convex") {
      ctx.addIssue({
        code: "custom",
        message: "convexExample requires the Convex backend",
        path: ["convexExample"],
      });
    }

    if (
      config.topology === "monorepo" &&
      config.apps !== undefined &&
      (config.apps.length !== 2 ||
        !config.apps.includes("web") ||
        !config.apps.includes("mobile"))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "monorepo currently supports exactly web and mobile",
        path: ["apps"],
      });
    }

    if (config.topology !== "monorepo" && config.apps !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "apps[] is only valid for monorepo topology",
        path: ["apps"],
      });
    }

    if (config.defaultLocale && !config.locales.includes(config.defaultLocale)) {
      ctx.addIssue({
        code: "custom",
        message: "defaultLocale must be included in locales[]",
        path: ["defaultLocale"],
      });
    }

    const hasMobile =
      config.topology === "mobile" || config.topology === "monorepo";
    if (hasMobile && !config.runtime) {
      ctx.addIssue({
        code: "custom",
        message: "mobile projects require runtime (expo-go | dev-build)",
        path: ["runtime"],
      });
    }

    const mobileI18n =
      typeof config.i18n === "object" ? config.i18n.mobile : config.i18n;
    if (hasMobile && config.runtime === "expo-go" && mobileI18n !== "none") {
      ctx.addIssue({
        code: "custom",
        message: "Expo Go currently requires mobile i18n to be none",
        path: ["i18n"],
      });
    }
    if (
      hasMobile &&
      config.runtime === "dev-build" &&
      mobileI18n !== "gt-react-native"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Expo development builds currently use gt-react-native",
        path: ["i18n"],
      });
    }
  });

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type PackageManager = z.infer<typeof packageManagerSchema>;
export type Topology = z.infer<typeof topologySchema>;
export type App = z.infer<typeof appSchema>;
export type Backend = z.infer<typeof backendSchema>;
export type Auth = z.infer<typeof authSchema>;
export type I18nWeb = z.infer<typeof i18nWebSchema>;
export type I18nMobile = z.infer<typeof i18nMobileSchema>;
export type UiWeb = z.infer<typeof uiWebSchema>;
export type UiMobile = z.infer<typeof uiMobileSchema>;
export type ExpoRuntime = z.infer<typeof expoRuntimeSchema>;

export type NormalizedI18n = {
  web?: I18nWeb;
  mobile?: I18nMobile;
};

export type NormalizedUi = {
  web?: UiWeb;
  mobile?: UiMobile;
};

export type ProjectStacks = {
  hasWeb: boolean;
  hasMobile: boolean;
};

export type NormalizedProjectConfig = Omit<ProjectConfig, "apps" | "i18n" | "ui"> & {
  apps: App[];
  i18n: NormalizedI18n;
  ui: NormalizedUi;
  stacks: ProjectStacks;
};

function resolveApps(config: ProjectConfig): App[] {
  if (config.topology === "web") {
    return ["web"];
  }
  if (config.topology === "mobile") {
    return ["mobile"];
  }
  return ["web", "mobile"];
}

function normalizeI18n(config: ProjectConfig, apps: App[]): NormalizedI18n {
  if (typeof config.i18n === "string") {
    if (config.topology === "web") {
      return { web: config.i18n as I18nWeb };
    }
    return { mobile: config.i18n as I18nMobile };
  }

  return {
    web: apps.includes("web") ? config.i18n.web : undefined,
    mobile: apps.includes("mobile") ? config.i18n.mobile : undefined,
  };
}

function normalizeUi(config: ProjectConfig, apps: App[]): NormalizedUi {
  if (typeof config.ui === "string") {
    if (config.topology === "web") {
      return { web: config.ui as UiWeb };
    }
    return { mobile: config.ui as UiMobile };
  }

  return {
    web: apps.includes("web") ? config.ui.web : undefined,
    mobile: apps.includes("mobile") ? config.ui.mobile : undefined,
  };
}

export function normalizeProjectConfig(config: ProjectConfig): NormalizedProjectConfig {
  const apps = resolveApps(config);
  const i18n = normalizeI18n(config, apps);
  const ui = normalizeUi(config, apps);

  return {
    ...config,
    apps,
    i18n,
    ui,
    stacks: {
      hasWeb: apps.includes("web"),
      hasMobile: apps.includes("mobile"),
    },
  };
}

export function parseProjectConfig(input: unknown): NormalizedProjectConfig {
  return normalizeProjectConfig(projectConfigSchema.parse(input));
}

export function projectConfigJsonSchema(): Record<string, unknown> {
  return toJSONSchema(projectConfigSchema, {
    target: "draft-2020-12",
    io: "input",
    reused: "inline",
  }) as Record<string, unknown>;
}

export function loadProjectConfigFromFile(configPath: string): NormalizedProjectConfig {
  const absolutePath = path.resolve(configPath);
  const raw = readFileSync(absolutePath, "utf-8");
  return parseProjectConfig(JSON.parse(raw) as unknown);
}
