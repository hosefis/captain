import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeRenderedFile } from "../generators/template.js";
import { templatesDirectory } from "../lib/paths.js";
import { resolveRecipePlan, type RecipeStep } from "../resolver/recipe-plan.js";
import type { App, NormalizedProjectConfiguration } from "../schema/project-configuration.js";
import { mergePackageJson } from "./package-json.js";
import { resolvePackageManagerDriver } from "./package-manager.js";
import { buildRecipeVariables, type RecipeVariables } from "./recipe-variables.js";
import { testedRange } from "./tested-versions.js";
import { applyCodeStandards } from "./code-standards.js";

/** Outcome of applying integration recipes, including the failed step when applicable. */
export type ApplyRecipesResult =
  | { ok: true; appliedRecipes: string[] }
  | { ok: false; stepId: string; message: string };

function coreSourceDirectory(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
): string {
  return configuration.topology === "monorepo"
    ? join(targetDirectory, "packages", "core", "src")
    : join(targetDirectory, "src", "lib");
}

function adapterSourceDirectory(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  adapterName: "adapters-next" | "adapters-expo",
): string {
  return configuration.topology === "monorepo"
    ? join(targetDirectory, "packages", adapterName, "src")
    : join(targetDirectory, "src", "integrations");
}

function appDirectory(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  app: "web" | "mobile",
): string {
  return configuration.topology === "monorepo"
    ? join(targetDirectory, "apps", app)
    : targetDirectory;
}

function appSourceDirectory(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  app: "web" | "mobile",
): string {
  return join(appDirectory(targetDirectory, configuration, app), "src");
}

function integrationPackagePath(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  adapterName: "adapters-next" | "adapters-expo",
): string {
  return configuration.topology === "monorepo"
    ? join(targetDirectory, "packages", adapterName, "package.json")
    : join(targetDirectory, "package.json");
}

function mergeApplicationManifest(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  app: "web" | "mobile",
  patch: Parameters<typeof mergePackageJson>[1],
): void {
  const packagePath = join(appDirectory(targetDirectory, configuration, app), "package.json");
  if (!existsSync(packagePath)) {
    return;
  }
  mergePackageJson(packagePath, patch);
}

function renderModuleFile(
  templateRelativePath: string,
  targetPath: string,
  variables: RecipeVariables,
): void {
  writeRenderedFile(join(templatesDirectory(), templateRelativePath), targetPath, variables);
}

function applyBackendRest(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  variables: RecipeVariables,
  onlyApp?: App,
): void {
  const coreDirectory = coreSourceDirectory(targetDirectory, configuration);
  if (!onlyApp) {
    mkdirSync(join(coreDirectory, "backend"), { recursive: true });
    renderModuleFile("modules/backend-client/client.ts", join(coreDirectory, "backend", "client.ts"), variables);
    renderModuleFile(
      "modules/backend-client/http-client.ts",
      join(coreDirectory, "backend", "http-client.ts"),
      variables,
    );
  }

  if (configuration.stacks.hasWeb && (!onlyApp || onlyApp === "web")) {
    const integrationsDirectory = adapterSourceDirectory(targetDirectory, configuration, "adapters-next");
    mkdirSync(join(integrationsDirectory, "backend"), { recursive: true });
    renderModuleFile(
      "adapters/backend/rest-next.ts",
      join(integrationsDirectory, "backend", "rest.ts"),
      variables,
    );
  }

  if (configuration.stacks.hasMobile && (!onlyApp || onlyApp === "mobile")) {
    const integrationsDirectory = adapterSourceDirectory(targetDirectory, configuration, "adapters-expo");
    mkdirSync(join(integrationsDirectory, "backend"), { recursive: true });
    renderModuleFile(
      "adapters/backend/rest-expo.ts",
      join(integrationsDirectory, "backend", "rest.ts"),
      variables,
    );
  }
}

function applyBackendConvex(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  variables: RecipeVariables,
): void {
  const monorepo = configuration.topology === "monorepo";
  const functionsDirectory = monorepo
    ? join(targetDirectory, "packages", "convex", "convex")
    : join(targetDirectory, "convex");
  const backendVariables = { ...variables, convexApiImport: "./_generated/api" };
  const renderBackendTemplate = (source: string, target: string): void =>
    renderModuleFile(`convex/backend/${source}`, join(functionsDirectory, target), backendVariables);
  renderModuleFile("convex/SETUP.md", join(targetDirectory, "CONVEX.md"), variables);
  mkdirSync(join(functionsDirectory, "_generated"), { recursive: true });
  renderBackendTemplate(
    configuration.convexExample
      ? configuration.auth === "clerk" ? "schema-clerk.ts" : "schema.ts"
      : "schema-empty.ts",
    "schema.ts",
  );
  if (configuration.auth === "clerk") {
    renderBackendTemplate("auth.config.ts", "auth.config.ts");
  }
  if (configuration.convexExample) {
    renderBackendTemplate(configuration.auth === "clerk" ? "tasks-clerk.ts" : "tasks-public.ts", "tasks.ts");
  }
  for (const file of ["api.js", "server.js", "server.d.ts"]) {
    renderBackendTemplate(`_generated/${file}`, `_generated/${file}`);
  }
  renderBackendTemplate(
    `_generated/${configuration.convexExample ? "api-tasks.d.ts" : "api-empty.d.ts"}`,
    "_generated/api.d.ts",
  );
  renderBackendTemplate(
    `_generated/${configuration.convexExample ? "dataModel-tasks.d.ts" : "dataModel-empty.d.ts"}`,
    "_generated/dataModel.d.ts",
  );

  const convexVersion = testedRange("convex");
  mergePackageJson(join(targetDirectory, "package.json"), {
    ...(monorepo ? { devDependencies: { convex: convexVersion } } : { dependencies: { convex: convexVersion } }),
    scripts: { "convex:dev": "convex dev", "convex:deploy": "convex deploy" },
  });

  if (monorepo) {
    writeFileSync(
      join(targetDirectory, "convex.json"),
      `${JSON.stringify({ functions: "packages/convex/convex/" }, null, 2)}\n`,
    );
    writeFileSync(
      join(targetDirectory, "packages", "convex", "package.json"),
      `${JSON.stringify({
        name: `${configuration.scope}/convex`,
        version: "0.0.0",
        private: true,
        type: "module",
        exports: {
          "./_generated/api": {
            types: "./convex/_generated/api.d.ts",
            default: "./convex/_generated/api.js",
          },
        },
        scripts: { typecheck: "tsc --noEmit", lint: "tsc --noEmit", build: "tsc --noEmit" },
        dependencies: { convex: convexVersion },
        devDependencies: { typescript: "^5.8.2", "@types/node": "^22.13.10" },
      }, null, 2)}\n`,
    );
    writeFileSync(
      join(targetDirectory, "packages", "convex", "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: {
        target: "ES2022", module: "ESNext", moduleResolution: "bundler",
        strict: true, skipLibCheck: true, noEmit: true, isolatedModules: true,
      }, include: ["convex"] }, null, 2)}\n`,
    );
  }

  for (const app of configuration.apps) {
    const sourceDirectory = appSourceDirectory(targetDirectory, configuration, app);
    const appVariables = {
      ...variables,
      convexApiImport: monorepo
        ? `${configuration.scope}/convex/_generated/api`
        : app === "web"
          ? "../../../convex/_generated/api"
          : "../../convex/_generated/api",
    };
    const renderApp = (source: string, target: string): void =>
      renderModuleFile(`convex/${app === "web" ? "web" : "mobile"}/${source}`, join(sourceDirectory, target), appVariables);
    const authenticationVariant = configuration.auth === "clerk" ? "clerk" : "none";
    renderApp(`provider-${authenticationVariant}.tsx`, "integrations/convex/convex-provider.tsx");
    renderApp("layout.tsx", app === "web" ? "app/layout.tsx" : "app/_layout.tsx");
    if (app === "web") {
      renderApp(`server-${authenticationVariant}.ts`, "integrations/convex/server.ts");
    }
    if (configuration.convexExample) {
      renderApp(`example-page-${authenticationVariant}.tsx`, app === "web" ? "app/example/page.tsx" : "app/example.tsx");
      renderApp("home.tsx", app === "web" ? "app/page.tsx" : "app/index.tsx");
      if (app === "mobile" && configuration.auth === "clerk") {
        renderApp("sign-in.tsx", "app/sign-in.tsx");
      }
    }
    const appDependencies: Record<string, string> = { convex: convexVersion };
    if (monorepo) {
      appDependencies[`${configuration.scope}/convex`] =
        resolvePackageManagerDriver(configuration.packageManager).workspaceRange;
    }
    mergeApplicationManifest(targetDirectory, configuration, app, { dependencies: appDependencies });
  }
}

function applyModuleAuthorization(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  variables: RecipeVariables,
): void {
  const authorizationDirectory =
    configuration.topology === "monorepo"
      ? join(coreSourceDirectory(targetDirectory, configuration), "authorization")
      : join(targetDirectory, "src", "features", "authorization");
  mkdirSync(authorizationDirectory, { recursive: true });

  renderModuleFile("modules/authorization/types.ts", join(authorizationDirectory, "types.ts"), variables);
  renderModuleFile("modules/authorization/authorize.ts", join(authorizationDirectory, "authorize.ts"), variables);
  renderModuleFile("modules/authorization/in-memory.ts", join(authorizationDirectory, "in-memory.ts"), variables);
}

function configureExpoAuthenticationPlugins(applicationDirectory: string): void {
  const configurationPath = join(applicationDirectory, "app.json");
  if (!existsSync(configurationPath)) return;

  const configuration = JSON.parse(readFileSync(configurationPath, "utf-8")) as {
    expo?: { plugins?: Array<string | unknown[]>; [key: string]: unknown };
  };
  const expo = configuration.expo ?? {};
  const plugins = expo.plugins ?? [];
  for (const plugin of ["expo-secure-store", "@clerk/expo"]) {
    if (!plugins.some((entry) => entry === plugin || (Array.isArray(entry) && entry[0] === plugin))) {
      plugins.push(plugin);
    }
  }
  writeFileSync(configurationPath, `${JSON.stringify({ ...configuration, expo: { ...expo, plugins } }, null, 2)}\n`);
}

function applyClerkAuthentication(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  variables: RecipeVariables,
  onlyApp?: App,
): void {
  if (configuration.stacks.hasWeb && (!onlyApp || onlyApp === "web")) {
    const integrationsDirectory = adapterSourceDirectory(targetDirectory, configuration, "adapters-next");
    mkdirSync(join(integrationsDirectory, "auth"), { recursive: true });
    renderModuleFile(
      "adapters/auth/clerk-next.ts",
      join(integrationsDirectory, "auth", "clerk.ts"),
      variables,
    );
    renderModuleFile(
      "scaffold/clerk-next-middleware.ts",
      join(appSourceDirectory(targetDirectory, configuration, "web"), "proxy.ts"),
      variables,
    );
    renderModuleFile(
      "scaffold/clerk-next-provider.tsx",
      join(
        appSourceDirectory(targetDirectory, configuration, "web"),
        "integrations",
        "auth",
        "authentication-provider.tsx",
      ),
      variables,
    );
    renderModuleFile(
      "scaffold/captain-next-layout.tsx",
      join(appSourceDirectory(targetDirectory, configuration, "web"), "app", "layout.tsx"),
      variables,
    );
    mergePackageJson(integrationPackagePath(targetDirectory, configuration, "adapters-next"), {
      dependencies: {
        "@clerk/nextjs": testedRange("@clerk/nextjs"),
      },
    });
    mergeApplicationManifest(targetDirectory, configuration, "web", {
      dependencies: {
        "@clerk/nextjs": testedRange("@clerk/nextjs"),
      },
    });
  }

  if (configuration.stacks.hasMobile && (!onlyApp || onlyApp === "mobile")) {
    const integrationsDirectory = adapterSourceDirectory(targetDirectory, configuration, "adapters-expo");
    mkdirSync(join(integrationsDirectory, "auth"), { recursive: true });
    renderModuleFile(
      "adapters/auth/clerk-expo.ts",
      join(integrationsDirectory, "auth", "clerk.ts"),
      variables,
    );
    renderModuleFile(
      "scaffold/clerk-expo-provider.tsx",
      join(
        appSourceDirectory(targetDirectory, configuration, "mobile"),
        "integrations",
        "auth",
        "authentication-provider.tsx",
      ),
      variables,
    );
    renderModuleFile(
      "scaffold/captain-expo-app.tsx",
      join(appSourceDirectory(targetDirectory, configuration, "mobile"), "app", "_layout.tsx"),
      variables,
    );
    configureExpoAuthenticationPlugins(appDirectory(targetDirectory, configuration, "mobile"));
    mergePackageJson(integrationPackagePath(targetDirectory, configuration, "adapters-expo"), {
      dependencies: {
        "@clerk/expo": testedRange("@clerk/expo"),
        "expo-secure-store": testedRange("expo-secure-store"),
        "expo-auth-session": testedRange("expo-auth-session"),
        "expo-crypto": testedRange("expo-crypto"),
      },
    });
    mergeApplicationManifest(targetDirectory, configuration, "mobile", {
      dependencies: {
        "@clerk/expo": testedRange("@clerk/expo"),
        "expo-secure-store": testedRange("expo-secure-store"),
        "expo-auth-session": testedRange("expo-auth-session"),
        "expo-crypto": testedRange("expo-crypto"),
      },
    });
  }
}

function applyWebTranslation(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  variables: RecipeVariables,
): void {
  const integrationsDirectory = adapterSourceDirectory(targetDirectory, configuration, "adapters-next");
  mkdirSync(join(integrationsDirectory, "i18n"), { recursive: true });
  renderModuleFile(
    "adapters/i18n/gt-next.ts",
    join(integrationsDirectory, "i18n", "gt-next.ts"),
    variables,
  );
  mergePackageJson(integrationPackagePath(targetDirectory, configuration, "adapters-next"), {
    dependencies: {
      "gt-next": testedRange("gt-next"),
    },
  });
  mergeApplicationManifest(targetDirectory, configuration, "web", {
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

function applyMobileTranslation(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  variables: RecipeVariables,
): void {
  const integrationsDirectory = adapterSourceDirectory(targetDirectory, configuration, "adapters-expo");
  mkdirSync(join(integrationsDirectory, "i18n"), { recursive: true });
  renderModuleFile(
    "adapters/i18n/gt-react-native.ts",
    join(integrationsDirectory, "i18n", "gt-react-native.ts"),
    variables,
  );
  mergePackageJson(integrationPackagePath(targetDirectory, configuration, "adapters-expo"), {
    dependencies: {
      "gt-react-native": testedRange("gt-react-native"),
    },
  });
  mergeApplicationManifest(targetDirectory, configuration, "mobile", {
    dependencies: {
      "gt-react-native": testedRange("gt-react-native"),
    },
  });
}

function applyTranslationEnforcement(targetDirectory: string, configuration: NormalizedProjectConfiguration, variables: RecipeVariables): void {
  const toolsDirectory = join(targetDirectory, "tools", "i18n");
  mkdirSync(toolsDirectory, { recursive: true });

  renderModuleFile("modules/i18n-enforcement/i18n-check.mjs", join(toolsDirectory, "i18n-check.mjs"), variables);
  renderModuleFile(
    "modules/i18n-enforcement/eslint-snippet.js",
    join(toolsDirectory, "eslint-i18n-snippet.js"),
    variables,
  );

  const internationalizationCheckCommand =
    `node tools/i18n/i18n-check.mjs --locales ${configuration.locales.join(",")} --default-locale ${configuration.defaultLocale}`;

  mergePackageJson(join(targetDirectory, "package.json"), {
    scripts: {
      "i18n:check": internationalizationCheckCommand,
    },
  });
}

function applyExpoLocalization(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
): void {
  mergeApplicationManifest(targetDirectory, configuration, "mobile", {
    dependencies: {
      "expo-localization": testedRange("expo-localization"),
    },
  });
  mergePackageJson(integrationPackagePath(targetDirectory, configuration, "adapters-expo"), {
    dependencies: {
      "expo-localization": testedRange("expo-localization"),
    },
  });
}

function applyWebShadcnBaseUi(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  variables: RecipeVariables,
): void {
  const integrationsDirectory = adapterSourceDirectory(targetDirectory, configuration, "adapters-next");
  mkdirSync(join(integrationsDirectory, "ui"), { recursive: true });
  renderModuleFile(
    "adapters/ui/shadcn-base-ui.ts",
    join(integrationsDirectory, "ui", "shadcn.ts"),
    variables,
  );
  renderModuleFile(
    "scaffold/shadcn-components.json",
    join(appDirectory(targetDirectory, configuration, "web"), "components.json"),
    variables,
  );
  mergeApplicationManifest(targetDirectory, configuration, "web", {
    devDependencies: {
      shadcn: testedRange("shadcn"),
    },
    scripts: {
      "ui:init": "npx shadcn@latest create --style base-vega --yes",
    },
  });
}

function applyMobileNativewind(
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  variables: RecipeVariables,
): void {
  const integrationsDirectory = adapterSourceDirectory(targetDirectory, configuration, "adapters-expo");
  mkdirSync(join(integrationsDirectory, "ui"), { recursive: true });
  renderModuleFile(
    "adapters/ui/nativewind.ts",
    join(integrationsDirectory, "ui", "nativewind.ts"),
    variables,
  );
  renderModuleFile(
    "scaffold/nativewind-metro.js",
    join(appDirectory(targetDirectory, configuration, "mobile"), "metro.config.js"),
    variables,
  );
  renderModuleFile(
    "scaffold/nativewind-global.css",
    join(appSourceDirectory(targetDirectory, configuration, "mobile"), "global.css"),
    variables,
  );
  renderModuleFile(
    "scaffold/nativewind-env.d.ts",
    join(appSourceDirectory(targetDirectory, configuration, "mobile"), "nativewind-env.d.ts"),
    variables,
  );
  const mobileDirectory = appDirectory(targetDirectory, configuration, "mobile");
  const hasEslintConfiguration = ["js", "mjs", "cjs", "ts", "mts", "cts"]
    .some((extension) => existsSync(join(mobileDirectory, `eslint.config.${extension}`)));
  if (!hasEslintConfiguration) {
    renderModuleFile("scaffold/expo-eslint.config.js", join(mobileDirectory, "eslint.config.js"), variables);
  }
  renderModuleFile(
    "scaffold/nativewind-tailwind.config.js",
    join(appDirectory(targetDirectory, configuration, "mobile"), "tailwind.config.js"),
    variables,
  );
  renderModuleFile(
    "scaffold/nativewind-babel.config.js",
    join(appDirectory(targetDirectory, configuration, "mobile"), "babel.config.js"),
    variables,
  );
  if (configuration.auth === "none") {
    renderModuleFile(
      "scaffold/captain-expo-layout-no-auth.tsx",
      join(appSourceDirectory(targetDirectory, configuration, "mobile"), "app", "_layout.tsx"),
      variables,
    );
  }
  mergeApplicationManifest(targetDirectory, configuration, "mobile", {
    dependencies: {
      nativewind: testedRange("nativewind"),
      "react-native-css-interop": testedRange("react-native-css-interop"),
    },
    devDependencies: {
      tailwindcss: testedRange("tailwindcss"),
      eslint: testedRange("eslint"),
      "eslint-config-expo": testedRange("eslint-config-expo"),
      "babel-preset-expo": testedRange("babel-preset-expo"),
      "@babel/core": testedRange("@babel/core"),
      "@babel/plugin-transform-react-jsx": testedRange("@babel/plugin-transform-react-jsx"),
      "@babel/plugin-transform-react-jsx-development": testedRange(
        "@babel/plugin-transform-react-jsx-development",
      ),
      "@babel/types": testedRange("@babel/types"),
    },
  });
}

const WORKSPACE_CONFIGURATION_STEPS = new Set([
  "project-structure",
  "context-md",
  "env-example",
  "agent-guidance",
  "starter-documentation",
  "expo-starter-lint",
]);

function applyRecipeStep(
  step: RecipeStep,
  targetDirectory: string,
  configuration: NormalizedProjectConfiguration,
  variables: RecipeVariables,
): void {
  switch (step.id) {
    case "code-standards":
      applyCodeStandards(configuration, targetDirectory);
      break;
    case "backend-rest":
      applyBackendRest(targetDirectory, configuration, variables);
      break;
    case "backend-convex":
      applyBackendConvex(targetDirectory, configuration, variables);
      break;
    case "module-authorization":
      applyModuleAuthorization(targetDirectory, configuration, variables);
      break;
    case "auth-clerk":
      applyClerkAuthentication(targetDirectory, configuration, variables);
      break;
    case "i18n-web-gt-next":
      applyWebTranslation(targetDirectory, configuration, variables);
      break;
    case "i18n-mobile-gt-react-native":
      applyMobileTranslation(targetDirectory, configuration, variables);
      break;
    case "i18n-enforcement":
      applyTranslationEnforcement(targetDirectory, configuration, variables);
      break;
    case "expo-localization":
      applyExpoLocalization(targetDirectory, configuration);
      break;
    case "ui-web-shadcn-base-ui":
      applyWebShadcnBaseUi(targetDirectory, configuration, variables);
      break;
    case "ui-mobile-nativewind":
      applyMobileNativewind(targetDirectory, configuration, variables);
      break;
    default:
      throw new Error(`Recipe step "${step.id}" is not implemented`);
  }
}

/** Applies selected integrations and optional standards after framework scaffolding. */
export function applyRecipes(
  configuration: NormalizedProjectConfiguration,
  targetDirectory: string,
  options: {
    /** Reports an integration step immediately before it is applied. */
    onStepStart?: (step: RecipeStep) => void;
    /** Reports successful completion of an integration step. */
    onStepComplete?: (step: RecipeStep) => void;
  } = {},
): ApplyRecipesResult {
  const variables = buildRecipeVariables(configuration);
  const steps = resolveRecipePlan(configuration).filter((step) => !WORKSPACE_CONFIGURATION_STEPS.has(step.id));
  const applied = new Set<string>();

  for (const step of steps) {
    try {
      options.onStepStart?.(step);
      applyRecipeStep(step, targetDirectory, configuration, variables);
      applied.add(step.id);
      options.onStepComplete?.(step);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recipe application failed";
      return { ok: false, stepId: step.id, message };
    }
  }

  return { ok: true, appliedRecipes: [...applied] };
}
