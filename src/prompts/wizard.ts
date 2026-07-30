import * as p from "@clack/prompts";
import type {
  App,
  Auth,
  Backend,
  CaptainModule,
  ExpoRuntime,
  I18nMobile,
  I18nWeb,
  NormalizedProjectConfig,
  PackageManager,
  Topology,
  UiMobile,
  UiWeb,
} from "../schema/project-config.js";
import { parseProjectConfig } from "../schema/project-config.js";

type WizardResult =
  | { cancelled: true }
  | { cancelled: false; config: NormalizedProjectConfig };

function cancelIfNeeded<T>(value: T | symbol): value is symbol {
  if (p.isCancel(value)) {
    p.cancel("Init cancelled.");
    return true;
  }
  return false;
}

export function deriveScopeFromProjectName(name: string): string {
  return `@${name.trim().toLowerCase()}`;
}

const PACKAGE_MANAGER_OPTIONS: Array<{ value: PackageManager; label: string }> = [
  { value: "pnpm", label: "pnpm (recommended)" },
  { value: "npm", label: "npm" },
  { value: "bun", label: "bun" },
];

const TOPOLOGY_OPTIONS: Array<{ value: Topology; label: string }> = [
  { value: "web", label: "Web only (Next.js)" },
  { value: "mobile", label: "Mobile only (Expo)" },
  { value: "monorepo", label: "Monorepo (Turborepo + apps)" },
];

const APP_OPTIONS: Array<{ value: App; label: string }> = [
  { value: "web", label: "Web (Next.js)" },
  { value: "mobile", label: "Mobile (Expo)" },
  { value: "desktop", label: "Desktop (Electron slot — v1 reserve only)" },
];

const BACKEND_OPTIONS: Array<{ value: Backend; label: string }> = [
  { value: "rest", label: "REST API (default)" },
  { value: "convex", label: "Convex" },
  { value: "supabase", label: "Supabase" },
  { value: "firebase", label: "Firebase" },
];

const AUTH_OPTIONS: Array<{ value: Auth; label: string }> = [
  { value: "clerk", label: "Clerk (default)" },
  { value: "better-auth", label: "Better Auth" },
  { value: "workos", label: "WorkOS" },
  { value: "skip", label: "Skip auth" },
];

const I18N_WEB_OPTIONS: Array<{ value: I18nWeb; label: string }> = [
  { value: "gt-next", label: "General Translation (gt-next)" },
  { value: "next-intl", label: "next-intl" },
];

const I18N_MOBILE_OPTIONS: Array<{ value: I18nMobile; label: string }> = [
  { value: "gt-react-native", label: "General Translation (gt-react-native)" },
  { value: "react-i18next", label: "react-i18next + expo-localization" },
];

const UI_WEB_OPTIONS: Array<{ value: UiWeb; label: string }> = [
  { value: "shadcn-base-ui", label: "shadcn + Base UI (default)" },
  { value: "shadcn-radix", label: "shadcn + Radix" },
  { value: "tailwind-only", label: "Tailwind only" },
];

const UI_MOBILE_OPTIONS: Array<{ value: UiMobile; label: string }> = [
  { value: "nativewind", label: "NativeWind (default)" },
  { value: "paper", label: "React Native Paper" },
  { value: "none", label: "None" },
];

const MODULE_OPTIONS: Array<{ value: CaptainModule; label: string }> = [
  { value: "authorization", label: "Authorization (recommended)" },
  { value: "admin-catalog", label: "AdminCatalog" },
  { value: "form-wizard", label: "FormWizard" },
  { value: "user-identity", label: "User Identity" },
];

const RUNTIME_OPTIONS: Array<{ value: ExpoRuntime; label: string }> = [
  { value: "dev-build", label: "Dev build (recommended for gt-react-native)" },
  { value: "expo-go", label: "Expo Go" },
];

export async function runWizard(): Promise<WizardResult> {
  p.intro("CAPTAIN — Create Apps Properly");

  const name = await p.text({
    message: "Project name (kebab-case)",
    placeholder: "acme-platform",
    validate: (value) => {
      if (!value.trim()) {
        return "Project name is required";
      }
      if (!/^[a-z0-9-]+$/i.test(value.trim())) {
        return "Use kebab-case letters, numbers, and hyphens only";
      }
      return undefined;
    },
  });
  if (cancelIfNeeded(name)) {
    return { cancelled: true };
  }

  const packageManager = await p.select({
    message: "Package manager",
    options: PACKAGE_MANAGER_OPTIONS,
    initialValue: "pnpm" as PackageManager,
  });
  if (cancelIfNeeded(packageManager)) {
    return { cancelled: true };
  }

  const topology = await p.select({
    message: "Topology",
    options: TOPOLOGY_OPTIONS,
    initialValue: "web" as Topology,
  });
  if (cancelIfNeeded(topology)) {
    return { cancelled: true };
  }

  let apps: App[] | undefined;
  if (topology === "monorepo") {
    const selectedApps = await p.multiselect({
      message: "Apps in monorepo",
      options: APP_OPTIONS,
      initialValues: ["web", "mobile"] as App[],
      required: true,
    });
    if (cancelIfNeeded(selectedApps)) {
      return { cancelled: true };
    }
    apps = selectedApps as App[];
  }

  const hasWeb = topology === "web" || apps?.includes("web") === true;
  const hasMobile = topology === "mobile" || apps?.includes("mobile") === true;

  let runtime: ExpoRuntime | undefined;
  if (hasMobile) {
    const selectedRuntime = await p.select({
      message: "Expo runtime",
      options: RUNTIME_OPTIONS,
      initialValue: "dev-build" as ExpoRuntime,
    });
    if (cancelIfNeeded(selectedRuntime)) {
      return { cancelled: true };
    }
    runtime = selectedRuntime as ExpoRuntime;
  }

  const backend = await p.select({
    message: "Backend",
    options: BACKEND_OPTIONS,
    initialValue: "rest" as Backend,
  });
  if (cancelIfNeeded(backend)) {
    return { cancelled: true };
  }

  const auth = await p.select({
    message: "Authentication",
    options: AUTH_OPTIONS,
    initialValue: "clerk" as Auth,
  });
  if (cancelIfNeeded(auth)) {
    return { cancelled: true };
  }

  let i18n: NormalizedProjectConfig["i18n"];
  if (topology === "monorepo") {
    const i18nWeb = hasWeb
      ? await p.select({
          message: "Web i18n",
          options: I18N_WEB_OPTIONS,
          initialValue: "gt-next" as I18nWeb,
        })
      : undefined;
    if (hasWeb && cancelIfNeeded(i18nWeb)) {
      return { cancelled: true };
    }

    const i18nMobile = hasMobile
      ? await p.select({
          message: "Mobile i18n",
          options: I18N_MOBILE_OPTIONS,
          initialValue: "gt-react-native" as I18nMobile,
        })
      : undefined;
    if (hasMobile && cancelIfNeeded(i18nMobile)) {
      return { cancelled: true };
    }

    i18n = {
      web: i18nWeb as I18nWeb | undefined,
      mobile: i18nMobile as I18nMobile | undefined,
    };
  } else if (topology === "web") {
    const i18nWeb = await p.select({
      message: "i18n",
      options: I18N_WEB_OPTIONS,
      initialValue: "gt-next" as I18nWeb,
    });
    if (cancelIfNeeded(i18nWeb)) {
      return { cancelled: true };
    }
    i18n = i18nWeb as I18nWeb;
  } else {
    const i18nMobile = await p.select({
      message: "i18n",
      options: I18N_MOBILE_OPTIONS,
      initialValue: "gt-react-native" as I18nMobile,
    });
    if (cancelIfNeeded(i18nMobile)) {
      return { cancelled: true };
    }
    i18n = i18nMobile as I18nMobile;
  }

  let ui: NormalizedProjectConfig["ui"];
  if (topology === "monorepo") {
    const uiWeb = hasWeb
      ? await p.select({
          message: "Web UI",
          options: UI_WEB_OPTIONS,
          initialValue: "shadcn-base-ui" as UiWeb,
        })
      : undefined;
    if (hasWeb && cancelIfNeeded(uiWeb)) {
      return { cancelled: true };
    }

    const uiMobile = hasMobile
      ? await p.select({
          message: "Mobile UI",
          options: UI_MOBILE_OPTIONS,
          initialValue: "nativewind" as UiMobile,
        })
      : undefined;
    if (hasMobile && cancelIfNeeded(uiMobile)) {
      return { cancelled: true };
    }

    ui = {
      web: uiWeb as UiWeb | undefined,
      mobile: uiMobile as UiMobile | undefined,
    };
  } else if (topology === "web") {
    const uiWeb = await p.select({
      message: "UI",
      options: UI_WEB_OPTIONS,
      initialValue: "shadcn-base-ui" as UiWeb,
    });
    if (cancelIfNeeded(uiWeb)) {
      return { cancelled: true };
    }
    ui = uiWeb as UiWeb;
  } else {
    const uiMobile = await p.select({
      message: "UI",
      options: UI_MOBILE_OPTIONS,
      initialValue: "nativewind" as UiMobile,
    });
    if (cancelIfNeeded(uiMobile)) {
      return { cancelled: true };
    }
    ui = uiMobile as UiMobile;
  }

  const selectedModules = await p.multiselect({
    message: "Modules",
    options: MODULE_OPTIONS,
    initialValues: ["authorization"] as CaptainModule[],
    required: true,
  });
  if (cancelIfNeeded(selectedModules)) {
    return { cancelled: true };
  }

  const modules = Array.from(
    new Set([...(selectedModules as CaptainModule[]), "authorization"]),
  );

  const localesInput = await p.text({
    message: "Locales (comma-separated)",
    placeholder: "en, fr",
    initialValue: "en, fr",
    validate: (value) => {
      const locales = value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (locales.length === 0) {
        return "Provide at least one locale";
      }
      return undefined;
    },
  });
  if (cancelIfNeeded(localesInput)) {
    return { cancelled: true };
  }

  const locales = (localesInput as string)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const defaultLocale = await p.select({
    message: "Default locale",
    options: locales.map((locale) => ({ value: locale, label: locale })),
    initialValue: locales[0],
  });
  if (cancelIfNeeded(defaultLocale)) {
    return { cancelled: true };
  }

  const config = parseProjectConfig({
    name: (name as string).trim(),
    scope: deriveScopeFromProjectName(name as string),
    packageManager: packageManager as PackageManager,
    topology: topology as Topology,
    apps,
    backend: backend as Backend,
    auth: auth as Auth,
    i18n,
    ui,
    modules,
    locales,
    defaultLocale: defaultLocale as string,
    runtime,
  });

  p.outro("Configuration captured — resolving compatibility next");

  return { cancelled: false, config };
}
