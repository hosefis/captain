import * as prompts from "@clack/prompts";
import {
  detectPackageManagers,
  type PackageManagerAvailability,
} from "../lib/package-manager-availability.js";
import {
  parseProjectConfiguration,
  type Authentication,
  type Backend,
  type ExpoRuntime,
  type NormalizedProjectConfiguration,
  type PackageManager,
  type Topology,
} from "../schema/project-configuration.js";
import {
  compatibleMobileInternationalization,
  SUPPORTED_OPTIONS,
  type SupportedOption,
} from "../supported-options.js";

type WizardResult =
  | { cancelled: true }
  | { error: string }
  | { cancelled: false; configuration: NormalizedProjectConfiguration };

const packageManagers: readonly PackageManager[] = ["pnpm", "npm", "bun"];

function availablePackageManagers(availability: PackageManagerAvailability): PackageManager[] {
  return packageManagers.filter((manager) => availability[manager]);
}

function unavailableMessage(
  manager: PackageManager,
  availability: PackageManagerAvailability,
): string {
  const available = availablePackageManagers(availability);
  return `${manager} --version failed. Install ${manager} and retry. Available package managers: ${available.length ? available.join(", ") : "none"}.`;
}

function cancelIfNeeded<T>(value: T | symbol): value is symbol {
  if (prompts.isCancel(value)) {
    prompts.cancel("Init cancelled.");
    return true;
  }
  return false;
}

/** Derives the workspace package scope from the project name. */
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

  return prompts.select<string>({
    message,
    options: options.map((option) => ({
      value: option.value,
      label: option.label,
    })),
    initialValue: initialValue ?? options[0]!.value,
  });
}

function summary(configuration: NormalizedProjectConfiguration): string {
  const lines = [
    `Project: ${configuration.name}`,
    `Package manager: ${configuration.packageManager}`,
    `Topology: ${configuration.topology}`,
  ];
  if (configuration.runtime) {
    lines.push(`Expo runtime: ${configuration.runtime}`);
  }
  lines.push(
    `Authentication: ${configuration.auth}`,
    `Backend: ${configuration.backend}`,
    `Convex example: ${configuration.convexExample ? "yes" : "no"}`,
    `Code standards enforcement: ${configuration.enforceCodeStandards ? "yes" : "no"}`,
    `Web i18n: ${configuration.i18n.web ?? "n/a"}`,
    `Mobile i18n: ${configuration.i18n.mobile ?? "n/a"}`,
    `Web UI: ${configuration.ui.web ?? "n/a"}`,
    `Mobile UI: ${configuration.ui.mobile ?? "n/a"}`,
  );
  if (configuration.i18n.web !== undefined || configuration.i18n.mobile !== "none") {
    lines.push(
      `Locales: ${configuration.locales.join(", ")}`,
      `Default locale: ${configuration.defaultLocale}`,
    );
  }
  return lines.join("\n");
}

/** Collects compatible scaffold choices and confirms the resolved configuration. */
export async function runWizard(
  options: {
    yes?: boolean;
    dryRun?: boolean;
    packageManagerAvailability?: PackageManagerAvailability;
  } = {},
): Promise<WizardResult> {
  const availability = options.packageManagerAvailability ?? await detectPackageManagers();
  const available = availablePackageManagers(availability);
  if (available.length === 0 && !options.dryRun) {
    return {
      error: "No package manager passed its version check. Install pnpm, npm, or bun and retry.",
    };
  }
  prompts.intro("CAPTAIN — Create Apps Properly");

  const name = await prompts.text({
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
    SUPPORTED_OPTIONS.packageManagers.map((option) => ({
      value: option.value,
      label: availability[option.value]
        ? option.label
        : `${option.value} (unavailable: ${option.value} --version failed)`,
    })),
    available[0] ?? "pnpm",
  );
  if (cancelIfNeeded(packageManager)) {
    return { cancelled: true };
  }

  if (!availability[packageManager as PackageManager]) {
    const message = unavailableMessage(packageManager as PackageManager, availability);
    if (!options.dryRun) {
      return { error: message };
    }
    prompts.log.warn(`Dry run only: ${message} A real run would stop here.`);
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

  const authentication = await selectSupported(
    "Authentication",
    SUPPORTED_OPTIONS.authentication,
    "clerk",
  );
  if (cancelIfNeeded(authentication)) {
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
    const selectedExample = await prompts.confirm({
      message: "Include a working Convex task list example?",
      initialValue: false,
    });
    if (cancelIfNeeded(selectedExample)) {
      return { cancelled: true };
    }
    convexExample = selectedExample;
  }

  const mobileInternationalization = runtime
    ? (await selectSupported(
        "Mobile internationalization",
        compatibleMobileInternationalization(runtime),
      ))
    : undefined;
  if (mobileInternationalization !== undefined && cancelIfNeeded(mobileInternationalization)) {
    return { cancelled: true };
  }

  const hasInternationalization = hasWeb || mobileInternationalization !== "none";
  let locales = ["en", "fr"];
  let defaultLocale = "en";
  if (hasInternationalization) {
    const localesInput = await prompts.text({
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

    const selectedDefaultLocale = await prompts.select({
      message: "Default locale",
      options: locales.map((locale) => ({ value: locale, label: locale })),
      initialValue: locales[0],
    });
    if (cancelIfNeeded(selectedDefaultLocale)) {
      return { cancelled: true };
    }
    defaultLocale = selectedDefaultLocale;
  }

  const enforceCodeStandards = await prompts.confirm({
    message: "Enforce code standards during lint?",
    initialValue: false,
  });
  if (cancelIfNeeded(enforceCodeStandards)) {
    return { cancelled: true };
  }

  const configuration = parseProjectConfiguration({
    name: name.trim(),
    scope: deriveScopeFromProjectName(name),
    packageManager: packageManager as PackageManager,
    topology: topology as Topology,
    backend: backend as Backend,
    convexExample,
    enforceCodeStandards,
    auth: authentication as Authentication,
    i18n:
      topology === "monorepo"
        ? {
            web: SUPPORTED_OPTIONS.webInternationalization[0].value,
            mobile: mobileInternationalization,
          }
        : topology === "web"
          ? SUPPORTED_OPTIONS.webInternationalization[0].value
          : mobileInternationalization,
    ui:
      topology === "monorepo"
        ? {
            web: SUPPORTED_OPTIONS.webUserInterface[0].value,
            mobile: SUPPORTED_OPTIONS.mobileUserInterface[0].value,
          }
        : topology === "web"
          ? SUPPORTED_OPTIONS.webUserInterface[0].value
          : SUPPORTED_OPTIONS.mobileUserInterface[0].value,
    locales,
    defaultLocale,
    runtime,
  });

  prompts.note(summary(configuration), "Configuration");
  if (!options.yes) {
    const confirmed = await prompts.confirm({
      message: "Create this project?",
      initialValue: true,
    });
    if (cancelIfNeeded(confirmed) || !confirmed) {
      prompts.cancel("Init cancelled.");
      return { cancelled: true };
    }
  }

  prompts.outro("Configuration confirmed");
  return { cancelled: false, configuration };
}
