import * as p from "@clack/prompts";
import {
  parseProjectConfig,
  type Auth,
  type Backend,
  type ExpoRuntime,
  type NormalizedProjectConfig,
  type PackageManager,
  type Topology,
} from "../schema/project-config.js";
import {
  compatibleMobileI18n,
  SUPPORTED_OPTIONS,
  type SupportedOption,
} from "../supported-options.js";

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

async function selectSupported(
  message: string,
  options: readonly SupportedOption<string>[],
  initialValue?: string,
): Promise<string | symbol> {
  if (options.length === 1) {
    return options[0]!.value;
  }

  return p.select<string>({
    message,
    options: options.map((option) => ({
      value: option.value,
      label: option.label,
    })),
    initialValue: initialValue ?? options[0]!.value,
  });
}

function summary(config: NormalizedProjectConfig): string {
  const lines = [
    `Project: ${config.name}`,
    `Package manager: ${config.packageManager}`,
    `Topology: ${config.topology}`,
  ];
  if (config.runtime) {
    lines.push(`Expo runtime: ${config.runtime}`);
  }
  lines.push(
    `Authentication: ${config.auth}`,
    `Backend: ${config.backend}`,
    `Convex example: ${config.convexExample ? "yes" : "no"}`,
    `Web i18n: ${config.i18n.web ?? "n/a"}`,
    `Mobile i18n: ${config.i18n.mobile ?? "n/a"}`,
    `Web UI: ${config.ui.web ?? "n/a"}`,
    `Mobile UI: ${config.ui.mobile ?? "n/a"}`,
  );
  if (config.i18n.web !== undefined || config.i18n.mobile !== "none") {
    lines.push(
      `Locales: ${config.locales.join(", ")}`,
      `Default locale: ${config.defaultLocale}`,
    );
  }
  return lines.join("\n");
}

export async function runWizard(options: { yes?: boolean } = {}): Promise<WizardResult> {
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

  const packageManager = await selectSupported(
    "Package manager",
    SUPPORTED_OPTIONS.packageManagers,
    "pnpm",
  );
  if (cancelIfNeeded(packageManager)) {
    return { cancelled: true };
  }

  const topology = await selectSupported(
    "Project type",
    SUPPORTED_OPTIONS.topologies,
    "web",
  );
  if (cancelIfNeeded(topology)) {
    return { cancelled: true };
  }

  const hasWeb = topology === "web" || topology === "monorepo";
  const hasMobile = topology === "mobile" || topology === "monorepo";

  let runtime: ExpoRuntime | undefined;
  if (hasMobile) {
    const selectedRuntime = await selectSupported(
      "Expo runtime",
      SUPPORTED_OPTIONS.runtimes,
      "dev-build",
    );
    if (cancelIfNeeded(selectedRuntime)) {
      return { cancelled: true };
    }
    runtime = selectedRuntime as ExpoRuntime;
  }

  const auth = await selectSupported(
    "Authentication",
    SUPPORTED_OPTIONS.authentication,
    "clerk",
  );
  if (cancelIfNeeded(auth)) {
    return { cancelled: true };
  }

  const backend = await selectSupported(
    "Backend",
    SUPPORTED_OPTIONS.backends,
    "rest",
  );
  if (cancelIfNeeded(backend)) {
    return { cancelled: true };
  }

  let convexExample = false;
  if (backend === "convex") {
    const selectedExample = await p.confirm({
      message: "Include a working Convex task list example?",
      initialValue: false,
    });
    if (cancelIfNeeded(selectedExample)) {
      return { cancelled: true };
    }
    convexExample = selectedExample;
  }

  const mobileI18n = runtime
    ? (await selectSupported(
        "Mobile internationalization",
        compatibleMobileI18n(runtime),
      ))
    : undefined;
  if (mobileI18n !== undefined && cancelIfNeeded(mobileI18n)) {
    return { cancelled: true };
  }

  const hasI18n = hasWeb || mobileI18n !== "none";
  let locales = ["en", "fr"];
  let defaultLocale = "en";
  if (hasI18n) {
    const localesInput = await p.text({
      message: "Locales (comma-separated)",
      placeholder: "en, fr",
      initialValue: "en, fr",
      validate: (value) =>
        value.split(",").some((entry) => entry.trim())
          ? undefined
          : "Provide at least one locale",
    });
    if (cancelIfNeeded(localesInput)) {
      return { cancelled: true };
    }
    locales = localesInput
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const selectedDefault = await p.select({
      message: "Default locale",
      options: locales.map((locale) => ({ value: locale, label: locale })),
      initialValue: locales[0],
    });
    if (cancelIfNeeded(selectedDefault)) {
      return { cancelled: true };
    }
    defaultLocale = selectedDefault;
  }

  const config = parseProjectConfig({
    name: name.trim(),
    scope: deriveScopeFromProjectName(name),
    packageManager: packageManager as PackageManager,
    topology: topology as Topology,
    backend: backend as Backend,
    convexExample,
    auth: auth as Auth,
    i18n:
      topology === "monorepo"
        ? {
            web: SUPPORTED_OPTIONS.webI18n[0].value,
            mobile: mobileI18n,
          }
        : topology === "web"
          ? SUPPORTED_OPTIONS.webI18n[0].value
          : mobileI18n,
    ui:
      topology === "monorepo"
        ? {
            web: SUPPORTED_OPTIONS.webUi[0].value,
            mobile: SUPPORTED_OPTIONS.mobileUi[0].value,
          }
        : topology === "web"
          ? SUPPORTED_OPTIONS.webUi[0].value
          : SUPPORTED_OPTIONS.mobileUi[0].value,
    locales,
    defaultLocale,
    runtime,
  });

  p.note(summary(config), "Configuration");
  if (!options.yes) {
    const confirmed = await p.confirm({
      message: "Create this project?",
      initialValue: true,
    });
    if (cancelIfNeeded(confirmed) || !confirmed) {
      p.cancel("Init cancelled.");
      return { cancelled: true };
    }
  }

  p.outro("Configuration confirmed");
  return { cancelled: false, config };
}
