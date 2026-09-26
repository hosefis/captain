import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeRenderedFile } from "../generators/template.js";
import { templatesDir } from "../lib/paths.js";
import { resolveRecipePlan, type RecipeStep } from "../resolver/recipe-plan.js";
import type { App, NormalizedProjectConfig } from "../schema/project-config.js";
import { mergePackageJson } from "./package-json.js";
import { resolvePackageManagerDriver } from "./package-manager.js";
import { buildRecipeVars, type RecipeVars } from "./recipe-vars.js";
import { testedRange } from "./tested-versions.js";

export type ApplyRecipesResult =
  | { ok: true; appliedRecipes: string[] }
  | { ok: false; stepId: string; message: string };

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

function applyBackendConvex(
  targetDir: string,
  config: NormalizedProjectConfig,
  vars: RecipeVars,
): void {
  const monorepo = config.topology === "monorepo";
  const functionsDir = monorepo
    ? join(targetDir, "packages", "convex", "convex")
    : join(targetDir, "convex");
  const backendVars = { ...vars, convexApiImport: "./_generated/api" };
  const backendTemplate = (source: string, target: string): void =>
    renderModuleFile(`convex/backend/${source}`, join(functionsDir, target), backendVars);
  renderModuleFile("convex/SETUP.md", join(targetDir, "CONVEX.md"), vars);
  mkdirSync(join(functionsDir, "_generated"), { recursive: true });
  backendTemplate(
    config.convexExample
      ? config.auth === "clerk" ? "schema-clerk.ts" : "schema.ts"
      : "schema-empty.ts",
    "schema.ts",
  );
  if (config.auth === "clerk") {
    backendTemplate("auth.config.ts", "auth.config.ts");
  }
  if (config.convexExample) {
    backendTemplate(config.auth === "clerk" ? "tasks-clerk.ts" : "tasks-public.ts", "tasks.ts");
  }
  for (const file of ["api.js", "server.js", "server.d.ts"]) {
    backendTemplate(`_generated/${file}`, `_generated/${file}`);
  }
  backendTemplate(
    `_generated/${config.convexExample ? "api-tasks.d.ts" : "api-empty.d.ts"}`,
    "_generated/api.d.ts",
  );
  backendTemplate(
    `_generated/${config.convexExample ? "dataModel-tasks.d.ts" : "dataModel-empty.d.ts"}`,
    "_generated/dataModel.d.ts",
  );

  const convexVersion = testedRange("convex");
  mergePackageJson(join(targetDir, "package.json"), {
    ...(monorepo ? { devDependencies: { convex: convexVersion } } : { dependencies: { convex: convexVersion } }),
    scripts: { "convex:dev": "convex dev", "convex:deploy": "convex deploy" },
  });

  if (monorepo) {
    writeFileSync(
      join(targetDir, "convex.json"),
      `${JSON.stringify({ functions: "packages/convex/convex/" }, null, 2)}\n`,
    );
    writeFileSync(
      join(targetDir, "packages", "convex", "package.json"),
      `${JSON.stringify({
        name: `${config.scope}/convex`,
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
      join(targetDir, "packages", "convex", "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: {
        target: "ES2022", module: "ESNext", moduleResolution: "bundler",
        strict: true, skipLibCheck: true, noEmit: true, isolatedModules: true,
      }, include: ["convex"] }, null, 2)}\n`,
    );
  }

  for (const app of config.apps) {
    const sourceDir = appSourceDir(targetDir, config, app);
    const appVars = {
      ...vars,
      convexApiImport: monorepo
        ? `${config.scope}/convex/_generated/api`
        : app === "web"
          ? "../../../convex/_generated/api"
          : "../../convex/_generated/api",
    };
    const renderApp = (source: string, target: string): void =>
      renderModuleFile(`convex/${app === "web" ? "web" : "mobile"}/${source}`, join(sourceDir, target), appVars);
    const authVariant = config.auth === "clerk" ? "clerk" : "none";
    renderApp(`provider-${authVariant}.tsx`, "integrations/convex/captain-convex-provider.tsx");
    renderApp("layout.tsx", app === "web" ? "app/layout.tsx" : "app/_layout.tsx");
    if (app === "web") {
      renderApp(`server-${authVariant}.ts`, "integrations/convex/server.ts");
    }
    if (config.convexExample) {
      renderApp(`example-page-${authVariant}.tsx`, app === "web" ? "app/example/page.tsx" : "app/example.tsx");
      renderApp("home.tsx", app === "web" ? "app/page.tsx" : "app/index.tsx");
      if (app === "mobile" && config.auth === "clerk") {
        renderApp("sign-in.tsx", "app/sign-in.tsx");
      }
    }
    const appDependencies: Record<string, string> = { convex: convexVersion };
    if (monorepo) {
      appDependencies[`${config.scope}/convex`] =
        resolvePackageManagerDriver(config.packageManager).workspaceRange;
    }
    mergeAppPackageJson(targetDir, config, app, { dependencies: appDependencies });
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
    const appJsonPath = join(appDir(targetDir, config, "mobile"), "app.json");
    if (existsSync(appJsonPath)) {
      const appJson = JSON.parse(readFileSync(appJsonPath, "utf-8")) as {
        expo?: { plugins?: Array<string | unknown[]>; [key: string]: unknown };
      };
      const expo = appJson.expo ?? {};
      const plugins = expo.plugins ?? [];
      for (const plugin of ["expo-secure-store", "@clerk/expo"]) {
        if (!plugins.some((entry) => entry === plugin || (Array.isArray(entry) && entry[0] === plugin))) {
          plugins.push(plugin);
        }
      }
      writeFileSync(appJsonPath, `${JSON.stringify({ ...appJson, expo: { ...expo, plugins } }, null, 2)}\n`);
    }
    mergePackageJson(integrationPackageJson(targetDir, config, "adapters-expo"), {
      dependencies: {
        "@clerk/expo": testedRange("@clerk/expo"),
        "expo-secure-store": testedRange("expo-secure-store"),
        "expo-auth-session": testedRange("expo-auth-session"),
        "expo-crypto": testedRange("expo-crypto"),
      },
    });
    mergeAppPackageJson(targetDir, config, "mobile", {
      dependencies: {
        "@clerk/expo": testedRange("@clerk/expo"),
        "expo-secure-store": testedRange("expo-secure-store"),
        "expo-auth-session": testedRange("expo-auth-session"),
        "expo-crypto": testedRange("expo-crypto"),
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
  renderModuleFile(
    "scaffold/expo-eslint.config.js",
    join(appDir(targetDir, config, "mobile"), "eslint.config.js"),
    vars,
  );
  renderModuleFile(
    "scaffold/nativewind-tailwind.config.js",
    join(appDir(targetDir, config, "mobile"), "tailwind.config.js"),
    vars,
  );
  renderModuleFile(
    "scaffold/nativewind-babel.config.js",
    join(appDir(targetDir, config, "mobile"), "babel.config.js"),
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
      "react-native-css-interop": testedRange("react-native-css-interop"),
    },
    devDependencies: {
      tailwindcss: testedRange("tailwindcss"),
      eslint: testedRange("eslint"),
      "eslint-config-expo": testedRange("eslint-config-expo"),
      "babel-preset-expo": testedRange("babel-preset-expo"),
      "@babel/core": testedRange("@babel/core"),
      "@babel/types": testedRange("@babel/types"),
    },
  });
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
    case "backend-convex":
      applyBackendConvex(targetDir, config, vars);
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

  return { ok: true, appliedRecipes: [...applied] };
}
