import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeRenderedFile } from "../generators/template.js";
import { templatesDir } from "../lib/paths.js";
import { resolveRecipePlan, type RecipeStep } from "../resolver/recipe-plan.js";
import type { App, NormalizedProjectConfig } from "../schema/project-config.js";
import { mergePackageJson } from "./package-json.js";
import { buildRecipeVars, type RecipeVars } from "./recipe-vars.js";
import { testedRange } from "./tested-versions.js";

export type ApplyRecipesResult =
  | { ok: true; appliedRecipes: string[] }
  | { ok: false; stepId: string; message: string };

type AdapterExports = {
  backend?: string[];
  auth?: string[];
  i18n?: string[];
  ui?: string[];
};

function coreSourceDir(
  targetDir: string,
  config: NormalizedProjectConfig,
): string {
  return config.topology === "monorepo"
    ? join(targetDir, "packages", "core", "src")
    : join(targetDir, "src", "lib");
}

function adapterSourceDir(
  targetDir: string,
  config: NormalizedProjectConfig,
  adapterId: "adapters-next" | "adapters-expo",
): string {
  return config.topology === "monorepo"
    ? join(targetDir, "packages", adapterId, "src")
    : join(targetDir, "src", "integrations");
}

function appDir(
  targetDir: string,
  config: NormalizedProjectConfig,
  app: "web" | "mobile",
): string {
  return config.topology === "monorepo"
    ? join(targetDir, "apps", app)
    : targetDir;
}

function appSourceDir(
  targetDir: string,
  config: NormalizedProjectConfig,
  app: "web" | "mobile",
): string {
  return join(appDir(targetDir, config, app), "src");
}

function integrationPackageJson(
  targetDir: string,
  config: NormalizedProjectConfig,
  adapterId: "adapters-next" | "adapters-expo",
): string {
  return config.topology === "monorepo"
    ? join(targetDir, "packages", adapterId, "package.json")
    : join(targetDir, "package.json");
}

function mergeAppPackageJson(
  targetDir: string,
  config: NormalizedProjectConfig,
  app: "web" | "mobile",
  patch: Parameters<typeof mergePackageJson>[1],
): void {
  const pkgPath = join(appDir(targetDir, config, app), "package.json");
  if (!existsSync(pkgPath)) {
    return;
  }
  mergePackageJson(pkgPath, patch);
}

function renderModuleFile(
  templateRelativePath: string,
  targetPath: string,
  vars: RecipeVars,
): void {
  writeRenderedFile(join(templatesDir(), templateRelativePath), targetPath, vars);
}

function applyBackendRest(
  targetDir: string,
  config: NormalizedProjectConfig,
  vars: RecipeVars,
  onlyApp?: App,
): void {
  const core = coreSourceDir(targetDir, config);
  if (!onlyApp) {
    mkdirSync(join(core, "backend"), { recursive: true });
    renderModuleFile("modules/backend-client/client.ts", join(core, "backend", "client.ts"), vars);
    renderModuleFile(
      "modules/backend-client/http-client.ts",
      join(core, "backend", "http-client.ts"),
      vars,
    );
    renderModuleFile("modules/backend-client/core-index.ts", join(core, "index.ts"), vars);
  }

  if (config.stacks.hasWeb && (!onlyApp || onlyApp === "web")) {
    const integrations = adapterSourceDir(targetDir, config, "adapters-next");
    mkdirSync(join(integrations, "backend"), { recursive: true });
    renderModuleFile(
      "adapters/backend/rest-next.ts",
      join(integrations, "backend", "rest.ts"),
      vars,
    );
  }

  if (config.stacks.hasMobile && (!onlyApp || onlyApp === "mobile")) {
    const integrations = adapterSourceDir(targetDir, config, "adapters-expo");
    mkdirSync(join(integrations, "backend"), { recursive: true });
    renderModuleFile(
      "adapters/backend/rest-expo.ts",
      join(integrations, "backend", "rest.ts"),
      vars,
    );
  }
}

function applyModuleAuthorization(
  targetDir: string,
  config: NormalizedProjectConfig,
  vars: RecipeVars,
): void {
  const authDir =
    config.topology === "monorepo"
      ? join(coreSourceDir(targetDir, config), "authorization")
      : join(targetDir, "src", "features", "authorization");
  mkdirSync(authDir, { recursive: true });

  renderModuleFile("modules/authorization/types.ts", join(authDir, "types.ts"), vars);
  renderModuleFile("modules/authorization/authorize.ts", join(authDir, "authorize.ts"), vars);
  renderModuleFile("modules/authorization/in-memory.ts", join(authDir, "in-memory.ts"), vars);
  if (config.topology !== "monorepo") {
    writeFileSync(
      join(authDir, "index.ts"),
      [
        'export type { AuthDecision, AuthorizationAction, AuthorizationAdapter, AuthorizationClaims } from "./types.js";',
        'export { authorize } from "./authorize.js";',
        'export { createInMemoryAuthorizationAdapter } from "./in-memory.js";',
        "",
      ].join("\n"),
    );
  }
}

function applyAuthClerk(
  targetDir: string,
  config: NormalizedProjectConfig,
  vars: RecipeVars,
  onlyApp?: App,
): void {
  if (config.stacks.hasWeb && (!onlyApp || onlyApp === "web")) {
    const integrations = adapterSourceDir(targetDir, config, "adapters-next");
    mkdirSync(join(integrations, "auth"), { recursive: true });
    renderModuleFile(
      "adapters/auth/clerk-next.ts",
      join(integrations, "auth", "clerk.ts"),
      vars,
    );
    renderModuleFile(
      "scaffold/clerk-next-middleware.ts",
      join(appSourceDir(targetDir, config, "web"), "proxy.ts"),
      vars,
    );
    renderModuleFile(
      "scaffold/clerk-next-provider.tsx",
      join(
        appSourceDir(targetDir, config, "web"),
        "integrations",
        "auth",
        "captain-auth-provider.tsx",
      ),
      vars,
    );
    renderModuleFile(
      "scaffold/captain-next-layout.tsx",
      join(appSourceDir(targetDir, config, "web"), "app", "layout.tsx"),
      vars,
    );
    mergePackageJson(integrationPackageJson(targetDir, config, "adapters-next"), {
      dependencies: {
        "@clerk/nextjs": testedRange("@clerk/nextjs"),
      },
    });
    mergeAppPackageJson(targetDir, config, "web", {
      dependencies: {
        "@clerk/nextjs": testedRange("@clerk/nextjs"),
      },
    });
  }

  if (config.stacks.hasMobile && (!onlyApp || onlyApp === "mobile")) {
    const integrations = adapterSourceDir(targetDir, config, "adapters-expo");
    mkdirSync(join(integrations, "auth"), { recursive: true });
    renderModuleFile(
      "adapters/auth/clerk-expo.ts",
      join(integrations, "auth", "clerk.ts"),
      vars,
    );
    renderModuleFile(
      "scaffold/clerk-expo-provider.tsx",
      join(
        appSourceDir(targetDir, config, "mobile"),
        "integrations",
        "auth",
        "captain-auth-provider.tsx",
      ),
      vars,
    );
    renderModuleFile(
      "scaffold/captain-expo-app.tsx",
      join(appSourceDir(targetDir, config, "mobile"), "app", "_layout.tsx"),
      vars,
    );
    mergePackageJson(integrationPackageJson(targetDir, config, "adapters-expo"), {
      dependencies: {
        "@clerk/expo": testedRange("@clerk/expo"),
        "expo-secure-store": testedRange("expo-secure-store"),
      },
    });
    mergeAppPackageJson(targetDir, config, "mobile", {
      dependencies: {
        "@clerk/expo": testedRange("@clerk/expo"),
        "expo-secure-store": testedRange("expo-secure-store"),
      },
    });
  }
}

function applyI18nWebGtNext(
  targetDir: string,
  config: NormalizedProjectConfig,
  vars: RecipeVars,
): void {
  const integrations = adapterSourceDir(targetDir, config, "adapters-next");
  mkdirSync(join(integrations, "i18n"), { recursive: true });
  renderModuleFile(
    "adapters/i18n/gt-next.ts",
    join(integrations, "i18n", "gt-next.ts"),
    vars,
  );
  mergePackageJson(integrationPackageJson(targetDir, config, "adapters-next"), {
    dependencies: {
      "gt-next": testedRange("gt-next"),
    },
  });
  mergeAppPackageJson(targetDir, config, "web", {
    dependencies: {
      "gt-next": testedRange("gt-next"),
    },
    devDependencies: {
      "gtx-cli": testedRange("gtx-cli"),
    },
    scripts: {
      "i18n:extract": "gtx-cli extract",
    },
  });
}

function applyI18nMobileGtReactNative(
  targetDir: string,
  config: NormalizedProjectConfig,
  vars: RecipeVars,
): void {
  const integrations = adapterSourceDir(targetDir, config, "adapters-expo");
  mkdirSync(join(integrations, "i18n"), { recursive: true });
  renderModuleFile(
    "adapters/i18n/gt-react-native.ts",
    join(integrations, "i18n", "gt-react-native.ts"),
    vars,
  );
  mergePackageJson(integrationPackageJson(targetDir, config, "adapters-expo"), {
    dependencies: {
      "gt-react-native": testedRange("gt-react-native"),
    },
  });
  mergeAppPackageJson(targetDir, config, "mobile", {
    dependencies: {
      "gt-react-native": testedRange("gt-react-native"),
    },
  });
}

function applyI18nEnforcement(targetDir: string, config: NormalizedProjectConfig, vars: RecipeVars): void {
  const toolsDir = join(targetDir, "tools", "i18n");
  mkdirSync(toolsDir, { recursive: true });

  renderModuleFile("modules/i18n-enforcement/i18n-check.mjs", join(toolsDir, "i18n-check.mjs"), vars);
  renderModuleFile(
    "modules/i18n-enforcement/eslint-snippet.js",
    join(toolsDir, "eslint-i18n-snippet.js"),
    vars,
  );

  const i18nCheckScript =
    `node tools/i18n/i18n-check.mjs --locales ${config.locales.join(",")} --default-locale ${config.defaultLocale}`;

  mergePackageJson(join(targetDir, "package.json"), {
    scripts: {
      "i18n:check": i18nCheckScript,
    },
  });
}

function applyExpoLocalization(
  targetDir: string,
  config: NormalizedProjectConfig,
): void {
  mergeAppPackageJson(targetDir, config, "mobile", {
    dependencies: {
      "expo-localization": testedRange("expo-localization"),
    },
  });
  mergePackageJson(integrationPackageJson(targetDir, config, "adapters-expo"), {
    dependencies: {
      "expo-localization": testedRange("expo-localization"),
    },
  });
}

function applyUiWebShadcnBaseUi(
  targetDir: string,
  config: NormalizedProjectConfig,
  vars: RecipeVars,
): void {
  const integrations = adapterSourceDir(targetDir, config, "adapters-next");
  mkdirSync(join(integrations, "ui"), { recursive: true });
  renderModuleFile(
    "adapters/ui/shadcn-base-ui.ts",
    join(integrations, "ui", "shadcn.ts"),
    vars,
  );
  renderModuleFile(
    "scaffold/shadcn-components.json",
    join(appDir(targetDir, config, "web"), "components.json"),
    vars,
  );
  mergeAppPackageJson(targetDir, config, "web", {
    devDependencies: {
      shadcn: testedRange("shadcn"),
    },
    scripts: {
      "ui:init": "npx shadcn@latest create --style base-vega --yes",
    },
  });
}

function applyUiMobileNativewind(
  targetDir: string,
  config: NormalizedProjectConfig,
  vars: RecipeVars,
): void {
  const integrations = adapterSourceDir(targetDir, config, "adapters-expo");
  mkdirSync(join(integrations, "ui"), { recursive: true });
  renderModuleFile(
    "adapters/ui/nativewind.ts",
    join(integrations, "ui", "nativewind.ts"),
    vars,
  );
  renderModuleFile(
    "scaffold/nativewind-metro.js",
    join(appDir(targetDir, config, "mobile"), "metro.config.js"),
    vars,
  );
  renderModuleFile(
    "scaffold/nativewind-global.css",
    join(appSourceDir(targetDir, config, "mobile"), "global.css"),
    vars,
  );
  renderModuleFile(
    "scaffold/nativewind-env.d.ts",
    join(appSourceDir(targetDir, config, "mobile"), "nativewind-env.d.ts"),
    vars,
  );
  if (config.auth === "none") {
    renderModuleFile(
      "scaffold/captain-expo-layout-no-auth.tsx",
      join(appSourceDir(targetDir, config, "mobile"), "app", "_layout.tsx"),
      vars,
    );
  }
  mergeAppPackageJson(targetDir, config, "mobile", {
    dependencies: {
      nativewind: testedRange("nativewind"),
    },
    devDependencies: {
      tailwindcss: testedRange("tailwindcss"),
    },
  });
}

function buildCoreIndex(
  applied: Set<string>,
  topology: NormalizedProjectConfig["topology"],
): string {
  const lines = [
    'export type { BackendClient, BackendClientFactory, HttpMethod, HttpRequestOptions } from "./backend/client.js";',
    'export { createHttpClient, type HttpClientConfig } from "./backend/http-client.js";',
  ];

  if (applied.has("module-authorization") && topology === "monorepo") {
    lines.push(
      'export type { AuthDecision, AuthorizationAction, AuthorizationAdapter, AuthorizationClaims } from "./authorization/types.js";',
      'export { authorize } from "./authorization/authorize.js";',
      'export { createInMemoryAuthorizationAdapter } from "./authorization/in-memory.js";',
    );
  }

  lines.push('export const CAPTAIN_CORE_VERSION = "0.1.0";');

  return `${lines.join("\n")}\n`;
}

function writeCoreIndex(
  targetDir: string,
  config: NormalizedProjectConfig,
  applied: Set<string>,
): void {
  writeFileSync(
    join(coreSourceDir(targetDir, config), "index.ts"),
    buildCoreIndex(applied, config.topology),
  );
}

function buildAdapterIndex(
  corePackage: string,
  adapterKind: "next" | "expo",
  exports: AdapterExports,
): string {
  const lines = [
    `export * from "${corePackage}";`,
    `export const ADAPTER = "${adapterKind}" as const;`,
  ];

  if (exports.backend?.length) {
    for (const symbol of exports.backend) {
      lines.push(`export { ${symbol} } from "./backend/rest.js";`);
    }
  }
  if (exports.auth?.length) {
    for (const symbol of exports.auth) {
      lines.push(`export { ${symbol} } from "./auth/clerk.js";`);
    }
  }
  if (exports.i18n?.length) {
    const i18nFile = adapterKind === "next" ? "gt-next.js" : "gt-react-native.js";
    for (const symbol of exports.i18n) {
      lines.push(`export { ${symbol} } from "./i18n/${i18nFile.replace(".js", "")}.js";`);
    }
  }
  if (exports.ui?.length) {
    const uiFile = adapterKind === "next" ? "shadcn.js" : "nativewind.js";
    for (const symbol of exports.ui) {
      lines.push(`export { ${symbol} } from "./ui/${uiFile.replace(".js", "")}.js";`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function writeAdapterIndexes(
  targetDir: string,
  config: NormalizedProjectConfig,
  vars: RecipeVars,
  applied: Set<string>,
  onlyApp?: App,
): void {
  if (config.stacks.hasWeb && (!onlyApp || onlyApp === "web")) {
    const exports: AdapterExports = {};
    if (applied.has("backend-rest")) {
      exports.backend = ["createRestBackendClient"];
    }
    if (applied.has("auth-clerk")) {
      exports.auth = ["clerkAuthConfig", "mapClerkClaims"];
    }
    if (applied.has("i18n-web-gt-next")) {
      exports.i18n = ["gtNextConfig"];
    }
    if (applied.has("ui-web-shadcn-base-ui")) {
      exports.ui = ["shadcnBaseUiConfig"];
    }
    if (Object.keys(exports).length > 0) {
      writeFileSync(
        join(adapterSourceDir(targetDir, config, "adapters-next"), "index.ts"),
        buildAdapterIndex(vars.corePackage ?? "", "next", exports),
      );
    }
  }

  if (config.stacks.hasMobile && (!onlyApp || onlyApp === "mobile")) {
    const exports: AdapterExports = {};
    if (applied.has("backend-rest")) {
      exports.backend = ["createRestBackendClient"];
    }
    if (applied.has("auth-clerk")) {
      exports.auth = ["clerkExpoConfig", "mapClerkExpoClaims"];
    }
    if (applied.has("i18n-mobile-gt-react-native")) {
      exports.i18n = ["gtReactNativeConfig"];
    }
    if (applied.has("ui-mobile-nativewind")) {
      exports.ui = ["nativeWindConfig", "nativeWindGlobalCss"];
    }
    if (Object.keys(exports).length > 0) {
      writeFileSync(
        join(adapterSourceDir(targetDir, config, "adapters-expo"), "index.ts"),
        buildAdapterIndex(vars.corePackage ?? "", "expo", exports),
      );
    }
  }
}

const WORKSPACE_CONFIG_STEPS = new Set([
  "project-structure",
  "context-md",
  "env-example",
  "project-json",
]);

function applyRecipeStep(
  step: RecipeStep,
  targetDir: string,
  config: NormalizedProjectConfig,
  vars: RecipeVars,
): void {
  switch (step.id) {
    case "backend-rest":
      applyBackendRest(targetDir, config, vars);
      break;
    case "module-authorization":
      applyModuleAuthorization(targetDir, config, vars);
      break;
    case "auth-clerk":
      applyAuthClerk(targetDir, config, vars);
      break;
    case "i18n-web-gt-next":
      applyI18nWebGtNext(targetDir, config, vars);
      break;
    case "i18n-mobile-gt-react-native":
      applyI18nMobileGtReactNative(targetDir, config, vars);
      break;
    case "i18n-enforcement":
      applyI18nEnforcement(targetDir, config, vars);
      break;
    case "expo-localization":
      applyExpoLocalization(targetDir, config);
      break;
    case "ui-web-shadcn-base-ui":
      applyUiWebShadcnBaseUi(targetDir, config, vars);
      break;
    case "ui-mobile-nativewind":
      applyUiMobileNativewind(targetDir, config, vars);
      break;
    default:
      throw new Error(`Recipe step "${step.id}" is not implemented`);
  }
}

export function applyRecipes(
  config: NormalizedProjectConfig,
  targetDir: string,
  options: {
    onStepStart?: (step: RecipeStep) => void;
    onStepComplete?: (step: RecipeStep) => void;
  } = {},
): ApplyRecipesResult {
  const vars = buildRecipeVars(config);
  const steps = resolveRecipePlan(config).filter((step) => !WORKSPACE_CONFIG_STEPS.has(step.id));
  const applied = new Set<string>();

  for (const step of steps) {
    try {
      options.onStepStart?.(step);
      applyRecipeStep(step, targetDir, config, vars);
      applied.add(step.id);
      options.onStepComplete?.(step);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recipe application failed";
      return { ok: false, stepId: step.id, message };
    }
  }

  try {
    writeCoreIndex(targetDir, config, applied);
    writeAdapterIndexes(targetDir, config, vars, applied);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Adapter index generation failed";
    return { ok: false, stepId: "adapter-index", message };
  }

  return { ok: true, appliedRecipes: [...applied] };
}
