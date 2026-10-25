import { readFileSync } from "node:fs";
import path from "node:path";
import { toJSONSchema, z } from "zod";
import {
  optionValues,
  SUPPORTED_OPTIONS,
} from "../supported-options.js";

/** Supported package managers accepted by scaffold configuration. */
export const packageManagerSchema = z.enum(
  optionValues(SUPPORTED_OPTIONS.packageManagers),
);
/** Supported standalone and workspace project layouts. */
export const topologySchema = z.enum(optionValues(SUPPORTED_OPTIONS.topologies));
/** Application platforms supported by the scaffold. */
export const appSchema = z.enum(["web", "mobile"]);
/** Implemented backend integrations accepted by the scaffold. */
export const backendSchema = z.enum(optionValues(SUPPORTED_OPTIONS.backends));
/** Authentication integrations accepted by scaffold configuration. */
export const authenticationSchema = z.enum(
  optionValues(SUPPORTED_OPTIONS.authentication),
);
/** Translation integrations supported by web applications. */
export const webInternationalizationSchema = z.enum(optionValues(SUPPORTED_OPTIONS.webI18n));
/** Translation integrations supported by mobile applications. */
export const mobileInternationalizationSchema = z.enum(
  optionValues(SUPPORTED_OPTIONS.mobileI18n),
);
/** User interface integrations supported by web applications. */
export const webUserInterfaceSchema = z.enum(optionValues(SUPPORTED_OPTIONS.webUi));
/** User interface integrations supported by mobile applications. */
export const mobileUserInterfaceSchema = z.enum(optionValues(SUPPORTED_OPTIONS.mobileUi));
/** Expo runtimes supported by mobile scaffolding. */
export const expoRuntimeSchema = z.enum(
  optionValues(SUPPORTED_OPTIONS.runtimes),
);

const scopeSchema = z
  .string()
  .regex(/^@[a-z0-9-]+$/i, "scope must be an npm scope like @acme");

const internationalizationStackSchema = z.object({
  web: webInternationalizationSchema.optional(),
  mobile: mobileInternationalizationSchema.optional(),
});

const userInterfaceStackSchema = z.object({
  web: webUserInterfaceSchema.optional(),
  mobile: mobileUserInterfaceSchema.optional(),
});

const internationalizationInputSchema = z.union([webInternationalizationSchema, mobileInternationalizationSchema, internationalizationStackSchema]);
const userInterfaceInputSchema = z.union([webUserInterfaceSchema, mobileUserInterfaceSchema, userInterfaceStackSchema]);

/** Validates supported scaffold choices and their cross-platform constraints. */
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
    enforceCodeStandards: z.boolean().default(false),
    auth: authenticationSchema.default("clerk"),
    i18n: internationalizationInputSchema,
    ui: userInterfaceInputSchema,
    locales: z.array(z.string().min(2)).min(1).default(["en", "fr"]),
    defaultLocale: z.string().min(2).default("en"),
    runtime: expoRuntimeSchema.optional(),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.convexExample && config.backend !== "convex") {
      context.addIssue({
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
      context.addIssue({
        code: "custom",
        message: "monorepo currently supports exactly web and mobile",
        path: ["apps"],
      });
    }

    if (config.topology !== "monorepo" && config.apps !== undefined) {
      context.addIssue({
        code: "custom",
        message: "apps[] is only valid for monorepo topology",
        path: ["apps"],
      });
    }

    if (config.defaultLocale && !config.locales.includes(config.defaultLocale)) {
      context.addIssue({
        code: "custom",
        message: "defaultLocale must be included in locales[]",
        path: ["defaultLocale"],
      });
    }

    const hasMobile =
      config.topology === "mobile" || config.topology === "monorepo";
    if (hasMobile && !config.runtime) {
      context.addIssue({
        code: "custom",
        message: "mobile projects require runtime (expo-go | dev-build)",
        path: ["runtime"],
      });
    }

    const mobileInternationalization =
      typeof config.i18n === "object" ? config.i18n.mobile : config.i18n;
    if (hasMobile && config.runtime === "expo-go" && mobileInternationalization !== "none") {
      context.addIssue({
        code: "custom",
        message: "Expo Go currently requires mobile i18n to be none",
        path: ["i18n"],
      });
    }
    if (
      hasMobile &&
      config.runtime === "dev-build" &&
      mobileInternationalization !== "gt-react-native"
    ) {
      context.addIssue({
        code: "custom",
        message: "Expo development builds currently use gt-react-native",
        path: ["i18n"],
      });
    }
  });

/** Validated scaffold choices with defaults applied. */
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
/** Package manager selected for scaffolding and dependency installation. */
export type PackageManager = z.infer<typeof packageManagerSchema>;
/** Layout of the generated standalone application or monorepo. */
export type Topology = z.infer<typeof topologySchema>;
/** Application platform included in the generated project. */
export type App = z.infer<typeof appSchema>;
/** Backend integration selected for the application. */
export type Backend = z.infer<typeof backendSchema>;
/** Authentication provider selected for the application. */
export type Authentication = z.infer<typeof authenticationSchema>;
/** Translation integration selected for the web application. */
export type WebInternationalization = z.infer<typeof webInternationalizationSchema>;
/** Translation integration selected for the mobile application. */
export type MobileInternationalization = z.infer<typeof mobileInternationalizationSchema>;
/** User interface integration selected for the web application. */
export type WebUserInterface = z.infer<typeof webUserInterfaceSchema>;
/** User interface integration selected for the mobile application. */
export type MobileUserInterface = z.infer<typeof mobileUserInterfaceSchema>;
/** Expo runtime used to execute the mobile application. */
export type ExpoRuntime = z.infer<typeof expoRuntimeSchema>;

/** Translation settings resolved separately for each selected application. */
export type NormalizedInternationalization = {
  web?: WebInternationalization;
  mobile?: MobileInternationalization;
};

/** User interface settings resolved separately for each selected application. */
export type NormalizedUserInterface = {
  web?: WebUserInterface;
  mobile?: MobileUserInterface;
};

/** Application platforms enabled by the selected project layout. */
export type ProjectStacks = {
  hasWeb: boolean;
  hasMobile: boolean;
};

/** Scaffold choices resolved into application-specific integration settings. */
export type NormalizedProjectConfig = Omit<ProjectConfig, "apps" | "i18n" | "ui"> & {
  apps: App[];
  i18n: NormalizedInternationalization;
  ui: NormalizedUserInterface;
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

function normalizeInternationalization(config: ProjectConfig, apps: App[]): NormalizedInternationalization {
  if (typeof config.i18n === "string") {
    if (config.topology === "web") {
      return { web: config.i18n as WebInternationalization };
    }
    return { mobile: config.i18n as MobileInternationalization };
  }

  return {
    web: apps.includes("web") ? config.i18n.web : undefined,
    mobile: apps.includes("mobile") ? config.i18n.mobile : undefined,
  };
}

function normalizeUserInterface(config: ProjectConfig, apps: App[]): NormalizedUserInterface {
  if (typeof config.ui === "string") {
    if (config.topology === "web") {
      return { web: config.ui as WebUserInterface };
    }
    return { mobile: config.ui as MobileUserInterface };
  }

  return {
    web: apps.includes("web") ? config.ui.web : undefined,
    mobile: apps.includes("mobile") ? config.ui.mobile : undefined,
  };
}

/** Resolves shared scaffold settings into the selected application stacks. */
export function normalizeProjectConfig(config: ProjectConfig): NormalizedProjectConfig {
  const apps = resolveApps(config);
  const internationalization = normalizeInternationalization(config, apps);
  const userInterface = normalizeUserInterface(config, apps);

  return {
    ...config,
    apps,
    i18n: internationalization,
    ui: userInterface,
    stacks: {
      hasWeb: apps.includes("web"),
      hasMobile: apps.includes("mobile"),
    },
  };
}

/** Validates scaffold input and resolves platform-specific defaults. */
export function parseProjectConfig(input: unknown): NormalizedProjectConfig {
  return normalizeProjectConfig(projectConfigSchema.parse(input));
}

/** Describes accepted scaffold input for JSON-aware editors and tooling. */
export function projectConfigJsonSchema(): Record<string, unknown> {
  return toJSONSchema(projectConfigSchema, {
    target: "draft-2020-12",
    io: "input",
    reused: "inline",
  }) as Record<string, unknown>;
}

/** Loads and validates scaffold choices from a JSON input file. */
export function loadProjectConfigFromFile(configPath: string): NormalizedProjectConfig {
  const absolutePath = path.resolve(configPath);
  const contents = readFileSync(absolutePath, "utf-8");
  return parseProjectConfig(JSON.parse(contents) as unknown);
}
