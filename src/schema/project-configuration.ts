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
export const webInternationalizationSchema = z.enum(optionValues(SUPPORTED_OPTIONS.webInternationalization));
/** Translation integrations supported by mobile applications. */
export const mobileInternationalizationSchema = z.enum(
  optionValues(SUPPORTED_OPTIONS.mobileInternationalization),
);
/** User interface integrations supported by web applications. */
export const webUserInterfaceSchema = z.enum(optionValues(SUPPORTED_OPTIONS.webUserInterface));
/** User interface integrations supported by mobile applications. */
export const mobileUserInterfaceSchema = z.enum(optionValues(SUPPORTED_OPTIONS.mobileUserInterface));
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
export const projectConfigurationSchema = z
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
  .superRefine((configuration, context) => {
    if (configuration.convexExample && configuration.backend !== "convex") {
      context.addIssue({
        code: "custom",
        message: "convexExample requires the Convex backend",
        path: ["convexExample"],
      });
    }

    if (
      configuration.topology === "monorepo" &&
      configuration.apps !== undefined &&
      (configuration.apps.length !== 2 ||
        !configuration.apps.includes("web") ||
        !configuration.apps.includes("mobile"))
    ) {
      context.addIssue({
        code: "custom",
        message: "monorepo currently supports exactly web and mobile",
        path: ["apps"],
      });
    }

    if (configuration.topology !== "monorepo" && configuration.apps !== undefined) {
      context.addIssue({
        code: "custom",
        message: "apps[] is only valid for monorepo topology",
        path: ["apps"],
      });
    }

    if (configuration.defaultLocale && !configuration.locales.includes(configuration.defaultLocale)) {
      context.addIssue({
        code: "custom",
        message: "defaultLocale must be included in locales[]",
        path: ["defaultLocale"],
      });
    }

    const hasMobile =
      configuration.topology === "mobile" || configuration.topology === "monorepo";
    if (hasMobile && !configuration.runtime) {
      context.addIssue({
        code: "custom",
        message: "mobile projects require runtime (expo-go | dev-build)",
        path: ["runtime"],
      });
    }

    const mobileInternationalization =
      typeof configuration.i18n === "object" ? configuration.i18n.mobile : configuration.i18n;
    if (hasMobile && configuration.runtime === "expo-go" && mobileInternationalization !== "none") {
      context.addIssue({
        code: "custom",
        message: "Expo Go currently requires mobile i18n to be none",
        path: ["i18n"],
      });
    }
    if (
      hasMobile &&
      configuration.runtime === "dev-build" &&
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
export type ProjectConfiguration = z.infer<typeof projectConfigurationSchema>;
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
export type NormalizedProjectConfiguration = Omit<ProjectConfiguration, "apps" | "i18n" | "ui"> & {
  apps: App[];
  i18n: NormalizedInternationalization;
  ui: NormalizedUserInterface;
  stacks: ProjectStacks;
};

function resolveApps(configuration: ProjectConfiguration): App[] {
  if (configuration.topology === "web") {
    return ["web"];
  }
  if (configuration.topology === "mobile") {
    return ["mobile"];
  }
  return ["web", "mobile"];
}

function normalizeInternationalization(configuration: ProjectConfiguration, apps: App[]): NormalizedInternationalization {
  if (typeof configuration.i18n === "string") {
    if (configuration.topology === "web") {
      return { web: configuration.i18n as WebInternationalization };
    }
    return { mobile: configuration.i18n as MobileInternationalization };
  }

  return {
    web: apps.includes("web") ? configuration.i18n.web : undefined,
    mobile: apps.includes("mobile") ? configuration.i18n.mobile : undefined,
  };
}

function normalizeUserInterface(configuration: ProjectConfiguration, apps: App[]): NormalizedUserInterface {
  if (typeof configuration.ui === "string") {
    if (configuration.topology === "web") {
      return { web: configuration.ui as WebUserInterface };
    }
    return { mobile: configuration.ui as MobileUserInterface };
  }

  return {
    web: apps.includes("web") ? configuration.ui.web : undefined,
    mobile: apps.includes("mobile") ? configuration.ui.mobile : undefined,
  };
}

/** Resolves shared scaffold settings into the selected application stacks. */
export function normalizeProjectConfiguration(configuration: ProjectConfiguration): NormalizedProjectConfiguration {
  const apps = resolveApps(configuration);
  const internationalization = normalizeInternationalization(configuration, apps);
  const userInterface = normalizeUserInterface(configuration, apps);

  return {
    ...configuration,
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
export function parseProjectConfiguration(input: unknown): NormalizedProjectConfiguration {
  return normalizeProjectConfiguration(projectConfigurationSchema.parse(input));
}

/** Describes accepted scaffold input for JSON-aware editors and tooling. */
export function projectConfigurationJsonSchema(): Record<string, unknown> {
  return toJSONSchema(projectConfigurationSchema, {
    target: "draft-2020-12",
    io: "input",
    reused: "inline",
  }) as Record<string, unknown>;
}

/** Loads and validates scaffold choices from a JSON input file. */
export function loadProjectConfigurationFromFile(configurationPath: string): NormalizedProjectConfiguration {
  const absolutePath = path.resolve(configurationPath);
  const contents = readFileSync(absolutePath, "utf-8");
  return parseProjectConfiguration(JSON.parse(contents) as unknown);
}
