import { readFileSync } from "node:fs";
import path from "node:path";
import { z, toJSONSchema } from "zod";

export const packageManagerSchema = z.enum(["pnpm", "npm", "bun"]);
export const topologySchema = z.enum(["web", "mobile", "monorepo"]);
export const appSchema = z.enum(["web", "mobile", "desktop"]);
export const backendSchema = z.enum(["rest", "convex", "supabase", "firebase"]);
export const authSchema = z.enum(["clerk", "better-auth", "workos", "skip"]);
export const i18nWebSchema = z.enum(["gt-next", "next-intl"]);
export const i18nMobileSchema = z.enum(["gt-react-native", "react-i18next"]);
export const uiWebSchema = z.enum(["shadcn-base-ui", "shadcn-radix", "tailwind-only"]);
export const uiMobileSchema = z.enum(["nativewind", "paper", "none"]);
export const moduleSchema = z.enum([
  "authorization",
  "admin-catalog",
  "form-wizard",
  "user-identity",
  "payment",
]);
export const paymentProcessorSchema = z.enum([
  "stripe",
  "clerk-billing",
  "lemon-squeezy",
  "polar",
  "paddle",
  "fedapay",
  "paystack",
  "flutterwave",
  "paydunya",
  "cinetpay",
  "custom-api",
]);
export const orchestrationSchema = z.enum([
  "provider-direct",
  "backend-mediated",
  "aggregator-hosted",
]);
export const expoRuntimeSchema = z.enum(["expo-go", "dev-build"]);
export const validationModeSchema = z.enum(["strict", "relaxed"]);

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

const paymentSchema = z.object({
  enabled: z.boolean(),
  processors: z.array(paymentProcessorSchema),
  orchestration: orchestrationSchema,
  primary: paymentProcessorSchema.nullable(),
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
    auth: authSchema.default("clerk"),
    i18n: i18nInputSchema,
    ui: uiInputSchema,
    modules: z.array(moduleSchema).default(["authorization"]),
    payment: paymentSchema.default({
      enabled: false,
      processors: [],
      orchestration: "backend-mediated",
      primary: null,
    }),
    locales: z.array(z.string().min(2)).min(1).default(["en", "fr"]),
    defaultLocale: z.string().min(2).default("en"),
    runtime: expoRuntimeSchema.optional(),
    validation: validationModeSchema.default("strict"),
  })
  .superRefine((config, ctx) => {
    if (config.topology === "monorepo") {
      if (!config.apps || config.apps.length === 0) {
        ctx.addIssue({
          code: "custom",
          message: "monorepo topology requires at least one app in apps[]",
          path: ["apps"],
        });
      }
    }

    if (config.defaultLocale && !config.locales.includes(config.defaultLocale)) {
      ctx.addIssue({
        code: "custom",
        message: "defaultLocale must be included in locales[]",
        path: ["defaultLocale"],
      });
    }

    const paymentModuleSelected = config.modules.includes("payment");
    if (paymentModuleSelected && !config.payment.enabled) {
      ctx.addIssue({
        code: "custom",
        message: 'payment module requires payment.enabled: true',
        path: ["payment", "enabled"],
      });
    }

    if (config.payment.enabled && config.payment.processors.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "payment.enabled requires at least one processor",
        path: ["payment", "processors"],
      });
    }

    if (
      config.payment.primary !== null &&
      config.payment.enabled &&
      !config.payment.processors.includes(config.payment.primary)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "payment.primary must be one of payment.processors",
        path: ["payment", "primary"],
      });
    }

    if (config.topology === "mobile" && !config.runtime) {
      ctx.addIssue({
        code: "custom",
        message: "mobile topology requires runtime (expo-go | dev-build)",
        path: ["runtime"],
      });
    }

    if (config.topology === "monorepo" && config.apps?.includes("mobile") && !config.runtime) {
      ctx.addIssue({
        code: "custom",
        message: "monorepo with mobile app requires runtime (expo-go | dev-build)",
        path: ["runtime"],
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
export type CaptainModule = z.infer<typeof moduleSchema>;
export type PaymentProcessor = z.infer<typeof paymentProcessorSchema>;
export type Orchestration = z.infer<typeof orchestrationSchema>;
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
  hasDesktop: boolean;
};

export type NormalizedProjectConfig = ProjectConfig & {
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
  return config.apps ?? [];
}

function normalizeI18n(config: ProjectConfig, apps: App[]): NormalizedI18n {
  if (typeof config.i18n === "string") {
    if (config.topology === "web" || apps.includes("web")) {
      return { web: config.i18n as I18nWeb };
    }
    return { mobile: config.i18n as I18nMobile };
  }

  return {
    web: config.i18n.web,
    mobile: config.i18n.mobile,
  };
}

function normalizeUi(config: ProjectConfig, apps: App[]): NormalizedUi {
  if (typeof config.ui === "string") {
    if (config.topology === "web" || apps.includes("web")) {
      return { web: config.ui as UiWeb };
    }
    return { mobile: config.ui as UiMobile };
  }

  return {
    web: config.ui.web,
    mobile: config.ui.mobile,
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
      hasDesktop: apps.includes("desktop"),
    },
  };
}

export function parseProjectConfig(input: unknown): NormalizedProjectConfig {
  const parsed = projectConfigSchema.parse(input);
  return normalizeProjectConfig(parsed);
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
  const json: unknown = JSON.parse(raw);
  return parseProjectConfig(json);
}
