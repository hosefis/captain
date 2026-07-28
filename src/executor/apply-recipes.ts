import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeRenderedFile } from "../generators/template.js";
import { templatesDir } from "../lib/paths.js";
import { resolveRecipePlan, type RecipeStep } from "../resolver/recipe-plan.js";
import type { NormalizedProjectConfig } from "../schema/project-config.js";
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

function coreDir(targetDir: string): string {
  return join(targetDir, "packages", "core");
}

function adapterDir(targetDir: string, adapterId: "adapters-next" | "adapters-expo"): string {
  return join(targetDir, "packages", adapterId);
}

function appDir(targetDir: string, app: "web" | "mobile"): string {
  return join(targetDir, "apps", app);
}

function mergeAppPackageJson(
  targetDir: string,
  app: "web" | "mobile",
  patch: Parameters<typeof mergePackageJson>[1],
): void {
  const pkgPath = join(appDir(targetDir, app), "package.json");
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

function applyBackendRest(targetDir: string, config: NormalizedProjectConfig, vars: RecipeVars): void {
  const core = coreDir(targetDir);
  mkdirSync(join(core, "src", "backend"), { recursive: true });

  renderModuleFile("modules/backend-client/client.ts", join(core, "src", "backend", "client.ts"), vars);
  renderModuleFile(
    "modules/backend-client/http-client.ts",
    join(core, "src", "backend", "http-client.ts"),
    vars,
  );
  renderModuleFile("modules/backend-client/core-index.ts", join(core, "src", "index.ts"), vars);

  if (config.stacks.hasWeb) {
    mkdirSync(join(adapterDir(targetDir, "adapters-next"), "src", "backend"), { recursive: true });
    renderModuleFile(
      "adapters/backend/rest-next.ts",
      join(adapterDir(targetDir, "adapters-next"), "src", "backend", "rest.ts"),
      vars,
    );
  }

  if (config.stacks.hasMobile) {
    mkdirSync(join(adapterDir(targetDir, "adapters-expo"), "src", "backend"), { recursive: true });
    renderModuleFile(
      "adapters/backend/rest-expo.ts",
      join(adapterDir(targetDir, "adapters-expo"), "src", "backend", "rest.ts"),
      vars,
    );
  }
}

function applyModuleAuthorization(targetDir: string, vars: RecipeVars): void {
  const authDir = join(coreDir(targetDir), "src", "authorization");
  mkdirSync(authDir, { recursive: true });

  renderModuleFile("modules/authorization/types.ts", join(authDir, "types.ts"), vars);
  renderModuleFile("modules/authorization/authorize.ts", join(authDir, "authorize.ts"), vars);
  renderModuleFile("modules/authorization/in-memory.ts", join(authDir, "in-memory.ts"), vars);
}

function applyAuthClerk(targetDir: string, config: NormalizedProjectConfig, vars: RecipeVars): void {
  if (config.stacks.hasWeb) {
    mkdirSync(join(adapterDir(targetDir, "adapters-next"), "src", "auth"), { recursive: true });
    renderModuleFile(
      "adapters/auth/clerk-next.ts",
      join(adapterDir(targetDir, "adapters-next"), "src", "auth", "clerk.ts"),
      vars,
    );
    renderModuleFile(
      "scaffold/clerk-next-middleware.ts",
      join(appDir(targetDir, "web"), "middleware.ts"),
      vars,
    );
    renderModuleFile(
      "scaffold/clerk-next-provider.tsx",
      join(appDir(targetDir, "web"), "app", "captain-auth-provider.tsx"),
      vars,
    );
    renderModuleFile(
      "scaffold/captain-next-layout.tsx",
      join(appDir(targetDir, "web"), "app", "layout.tsx"),
      vars,
    );
    mergePackageJson(join(adapterDir(targetDir, "adapters-next"), "package.json"), {
      dependencies: {
        "@clerk/nextjs": testedRange("@clerk/nextjs"),
      },
    });
    mergeAppPackageJson(targetDir, "web", {
      dependencies: {
        "@clerk/nextjs": testedRange("@clerk/nextjs"),
      },
    });
  }

  if (config.stacks.hasMobile) {
    mkdirSync(join(adapterDir(targetDir, "adapters-expo"), "src", "auth"), { recursive: true });
    renderModuleFile(
      "adapters/auth/clerk-expo.ts",
      join(adapterDir(targetDir, "adapters-expo"), "src", "auth", "clerk.ts"),
      vars,
    );
    renderModuleFile(
      "scaffold/clerk-expo-provider.tsx",
      join(appDir(targetDir, "mobile"), "captain-auth-provider.tsx"),
      vars,
    );
    renderModuleFile(
      "scaffold/captain-expo-app.tsx",
      join(appDir(targetDir, "mobile"), "App.tsx"),
      vars,
    );
    mergePackageJson(join(adapterDir(targetDir, "adapters-expo"), "package.json"), {
      dependencies: {
        "@clerk/expo": testedRange("@clerk/expo"),
        "expo-secure-store": testedRange("expo-secure-store"),
      },
    });
    mergeAppPackageJson(targetDir, "mobile", {
      dependencies: {
        "@clerk/expo": testedRange("@clerk/expo"),
        "expo-secure-store": testedRange("expo-secure-store"),
      },
    });
  }
}

function applyI18nWebGtNext(targetDir: string, vars: RecipeVars): void {
  mkdirSync(join(adapterDir(targetDir, "adapters-next"), "src", "i18n"), { recursive: true });
  renderModuleFile(
    "adapters/i18n/gt-next.ts",
    join(adapterDir(targetDir, "adapters-next"), "src", "i18n", "gt-next.ts"),
    vars,
  );
  mergePackageJson(join(adapterDir(targetDir, "adapters-next"), "package.json"), {
    dependencies: {
      "gt-next": testedRange("gt-next"),
    },
  });
  mergeAppPackageJson(targetDir, "web", {
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

function applyI18nMobileGtReactNative(targetDir: string, vars: RecipeVars): void {
  mkdirSync(join(adapterDir(targetDir, "adapters-expo"), "src", "i18n"), { recursive: true });
  renderModuleFile(
    "adapters/i18n/gt-react-native.ts",
    join(adapterDir(targetDir, "adapters-expo"), "src", "i18n", "gt-react-native.ts"),
    vars,
  );
  mergePackageJson(join(adapterDir(targetDir, "adapters-expo"), "package.json"), {
    dependencies: {
      "gt-react-native": testedRange("gt-react-native"),
    },
  });
  mergeAppPackageJson(targetDir, "mobile", {
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

function applyExpoLocalization(targetDir: string): void {
  mergeAppPackageJson(targetDir, "mobile", {
    dependencies: {
      "expo-localization": testedRange("expo-localization"),
    },
  });
  mergePackageJson(join(adapterDir(targetDir, "adapters-expo"), "package.json"), {
    dependencies: {
      "expo-localization": testedRange("expo-localization"),
    },
  });
}

function applyUiWebShadcnBaseUi(targetDir: string, vars: RecipeVars): void {
  mkdirSync(join(adapterDir(targetDir, "adapters-next"), "src", "ui"), { recursive: true });
  renderModuleFile(
    "adapters/ui/shadcn-base-ui.ts",
    join(adapterDir(targetDir, "adapters-next"), "src", "ui", "shadcn.ts"),
    vars,
  );
  renderModuleFile(
    "scaffold/shadcn-components.json",
    join(appDir(targetDir, "web"), "components.json"),
    vars,
  );
  mergeAppPackageJson(targetDir, "web", {
    devDependencies: {
      shadcn: testedRange("shadcn"),
    },
    scripts: {
      "ui:init": "npx shadcn@latest create --style base-vega --yes",
    },
  });
}

function applyUiMobileNativewind(targetDir: string, vars: RecipeVars): void {
  mkdirSync(join(adapterDir(targetDir, "adapters-expo"), "src", "ui"), { recursive: true });
  renderModuleFile(
    "adapters/ui/nativewind.ts",
    join(adapterDir(targetDir, "adapters-expo"), "src", "ui", "nativewind.ts"),
    vars,
  );
  renderModuleFile(
    "scaffold/nativewind-metro.js",
    join(appDir(targetDir, "mobile"), "metro.config.js"),
    vars,
  );
  renderModuleFile(
    "scaffold/nativewind-global.css",
    join(appDir(targetDir, "mobile"), "global.css"),
    vars,
  );
  renderModuleFile(
    "scaffold/nativewind-env.d.ts",
    join(appDir(targetDir, "mobile"), "nativewind-env.d.ts"),
    vars,
  );
  mergeAppPackageJson(targetDir, "mobile", {
    dependencies: {
      nativewind: testedRange("nativewind"),
    },
    devDependencies: {
      tailwindcss: testedRange("tailwindcss"),
    },
  });
}

function applyModuleAdminCatalog(targetDir: string, vars: RecipeVars): void {
  const catalogDir = join(coreDir(targetDir), "src", "admin-catalog");
  mkdirSync(catalogDir, { recursive: true });
  mkdirSync(join(catalogDir, "resources"), { recursive: true });

  renderModuleFile("modules/admin-catalog/types.ts", join(catalogDir, "types.ts"), vars);
  renderModuleFile("modules/admin-catalog/driver.ts", join(catalogDir, "driver.ts"), vars);
}

function applyModuleFormWizard(targetDir: string, vars: RecipeVars): void {
  const wizardDir = join(coreDir(targetDir), "src", "form-wizard");
  mkdirSync(wizardDir, { recursive: true });

  renderModuleFile("modules/form-wizard/types.ts", join(wizardDir, "types.ts"), vars);
  renderModuleFile("modules/form-wizard/wizard.ts", join(wizardDir, "wizard.ts"), vars);
  renderModuleFile(
    "modules/form-wizard/use-form-wizard.ts",
    join(wizardDir, "use-form-wizard.ts"),
    vars,
  );
  mergePackageJson(join(coreDir(targetDir), "package.json"), {
    peerDependencies: { react: testedRange("react") },
    devDependencies: {
      "@types/react": testedRange("@types/react"),
      react: testedRange("react"),
    },
  });
}

function applyModuleUserIdentity(targetDir: string, vars: RecipeVars): void {
  const identityDir = join(coreDir(targetDir), "src", "user-identity");
  mkdirSync(identityDir, { recursive: true });

  renderModuleFile("modules/user-identity/types.ts", join(identityDir, "types.ts"), vars);
  renderModuleFile("modules/user-identity/identity.ts", join(identityDir, "identity.ts"), vars);
  renderModuleFile("modules/user-identity/in-memory.ts", join(identityDir, "in-memory.ts"), vars);
}

function writeCoreIndex(
  targetDir: string,
  _vars: RecipeVars,
  applied: Set<string>,
): void {
  const lines = [
    'export type { BackendClient, BackendClientFactory, HttpMethod, HttpRequestOptions } from "./backend/client.js";',
    'export { createHttpClient, type HttpClientConfig } from "./backend/http-client.js";',
  ];

  if (applied.has("module-authorization")) {
    lines.push(
      'export type { AuthDecision, AuthorizationAction, AuthorizationAdapter, AuthorizationClaims } from "./authorization/types.js";',
      'export { authorize } from "./authorization/authorize.js";',
      'export { createInMemoryAuthorizationAdapter } from "./authorization/in-memory.js";',
    );
  }

  if (applied.has("module-admin-catalog")) {
    lines.push(
      'export type { AdminCatalogConfig, AdminCatalogDriver, CatalogColumnDef, CatalogListItem } from "./admin-catalog/types.js";',
      'export { createAdminCatalogDriver } from "./admin-catalog/driver.js";',
    );
  }

  if (applied.has("module-form-wizard")) {
    lines.push(
      'export type { FormWizardConfig, FormWizardStepDef, FormWizardSubmitAdapter, FormWizardUploadAdapter } from "./form-wizard/types.js";',
      'export type { FormWizardController, FormWizardState } from "./form-wizard/wizard.js";',
      'export { createFormWizard } from "./form-wizard/wizard.js";',
      'export { useFormWizard } from "./form-wizard/use-form-wizard.js";',
    );
  }

  if (applied.has("module-user-identity")) {
    lines.push(
      'export type { UserIdentityAdapter, UserIdentityConfig, UserProfile, UserRole } from "./user-identity/types.js";',
      'export type { UserIdentity } from "./user-identity/identity.js";',
      'export { createUserIdentity } from "./user-identity/identity.js";',
      'export { createInMemoryUserIdentityAdapter } from "./user-identity/in-memory.js";',
    );
  }

  lines.push('export const CAPTAIN_CORE_VERSION = "0.1.0";');

  writeFileSync(join(coreDir(targetDir), "src", "index.ts"), `${lines.join("\n")}\n`);
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
): void {
  if (config.stacks.hasWeb) {
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
        join(adapterDir(targetDir, "adapters-next"), "src", "index.ts"),
        buildAdapterIndex(vars.corePackage ?? "", "next", exports),
      );
    }
  }

  if (config.stacks.hasMobile) {
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
        join(adapterDir(targetDir, "adapters-expo"), "src", "index.ts"),
        buildAdapterIndex(vars.corePackage ?? "", "expo", exports),
      );
    }
  }
}

const WORKSPACE_CONFIG_STEPS = new Set([
  "workspace-promote",
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
      applyModuleAuthorization(targetDir, vars);
      break;
    case "auth-clerk":
      applyAuthClerk(targetDir, config, vars);
      break;
    case "i18n-web-gt-next":
      applyI18nWebGtNext(targetDir, vars);
      break;
    case "i18n-mobile-gt-react-native":
      applyI18nMobileGtReactNative(targetDir, vars);
      break;
    case "i18n-enforcement":
      applyI18nEnforcement(targetDir, config, vars);
      break;
    case "expo-localization":
      applyExpoLocalization(targetDir);
      break;
    case "ui-web-shadcn-base-ui":
      applyUiWebShadcnBaseUi(targetDir, vars);
      break;
    case "ui-mobile-nativewind":
      applyUiMobileNativewind(targetDir, vars);
      break;
    case "module-admin-catalog":
      applyModuleAdminCatalog(targetDir, vars);
      break;
    case "module-form-wizard":
      applyModuleFormWizard(targetDir, vars);
      break;
    case "module-user-identity":
      applyModuleUserIdentity(targetDir, vars);
      break;
    default:
      throw new Error(`Recipe step "${step.id}" is not implemented`);
  }
}

export function applyRecipes(
  config: NormalizedProjectConfig,
  targetDir: string,
): ApplyRecipesResult {
  const vars = buildRecipeVars(config);
  const steps = resolveRecipePlan(config).filter((step) => !WORKSPACE_CONFIG_STEPS.has(step.id));
  const applied = new Set<string>();

  for (const step of steps) {
    try {
      applyRecipeStep(step, targetDir, config, vars);
      applied.add(step.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recipe application failed";
      return { ok: false, stepId: step.id, message };
    }
  }

  try {
    writeCoreIndex(targetDir, vars, applied);
    writeAdapterIndexes(targetDir, config, vars, applied);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Adapter index generation failed";
    return { ok: false, stepId: "adapter-index", message };
  }

  return { ok: true, appliedRecipes: [...applied] };
}

export function recipeStepIsImplemented(stepId: string): boolean {
  const implemented = new Set([
    "backend-rest",
    "module-authorization",
    "module-admin-catalog",
    "module-form-wizard",
    "module-user-identity",
    "auth-clerk",
    "i18n-web-gt-next",
    "i18n-mobile-gt-react-native",
    "i18n-enforcement",
    "expo-localization",
    "ui-web-shadcn-base-ui",
    "ui-mobile-nativewind",
  ]);
  return implemented.has(stepId);
}
