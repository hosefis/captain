import type { NormalizedProjectConfig, PackageManager } from "../schema/project-config.js";

export type BootstrapStep = {
  id: string;
  description: string;
  command: string;
  commandArguments: string[];
  workingDirectory: string;
};

function packageExecutorCommand(packageManager: PackageManager): string {
  if (packageManager === "npm") {
    return "npx";
  }
  if (packageManager === "bun") {
    return "bunx";
  }
  return "pnpm dlx";
}

function nextAppArguments(configuration: NormalizedProjectConfig, targetDirectory: string): string[] {
  const useFlag =
    configuration.packageManager === "pnpm"
      ? "--use-pnpm"
      : configuration.packageManager === "bun"
        ? "--use-bun"
        : "--use-npm";

  return [
    "create-next-app@latest",
    targetDirectory,
    "--typescript",
    "--tailwind",
    "--eslint",
    "--app",
    "--src-dir",
    "--yes",
    useFlag,
  ];
}

function expoAppArguments(targetDirectory: string): string[] {
  return ["create-expo-app@latest", targetDirectory, "--template", "default", "--yes"];
}

function turboArguments(configuration: NormalizedProjectConfig): string[] {
  const packageManagerFlag =
    configuration.packageManager === "pnpm"
      ? "pnpm"
      : configuration.packageManager === "bun"
        ? "bun"
        : "npm";

  return [
    "create-turbo@latest",
    ".",
    "--example",
    "basic",
    "--skip-install",
    "--package-manager",
    packageManagerFlag,
  ];
}

function spawnStep(
  id: string,
  description: string,
  packageManager: PackageManager,
  commandArguments: string[],
  workingDirectory: string,
): BootstrapStep {
  const packageExecutor = packageExecutorCommand(packageManager);
  const [command, ...executorPrefix] = packageExecutor.split(" ");

  return {
    id,
    description,
    command: command ?? packageExecutor,
    commandArguments: [...executorPrefix, ...commandArguments],
    workingDirectory,
  };
}

/** Plan framework starter commands for the requested apps and topology. */
export function resolveBootstrapPlan(
  configuration: NormalizedProjectConfig,
  targetDirectory: string,
): BootstrapStep[] {
  const steps: BootstrapStep[] = [];

  if (configuration.topology === "web") {
    steps.push(
      spawnStep(
        "bootstrap-web",
        "Scaffold Next.js app (TypeScript, App Router, Tailwind, ESLint)",
        configuration.packageManager,
        nextAppArguments(configuration, "."),
        targetDirectory,
      ),
    );
    return steps;
  }

  if (configuration.topology === "mobile") {
    steps.push(
      spawnStep(
        "bootstrap-mobile",
        "Scaffold Expo Router app (default template)",
        configuration.packageManager,
        expoAppArguments("."),
        targetDirectory,
      ),
    );
    return steps;
  }

  steps.push(
    spawnStep(
      "bootstrap-monorepo",
      "Scaffold Turborepo monorepo base",
      configuration.packageManager,
      turboArguments(configuration),
      targetDirectory,
    ),
  );

  if (configuration.stacks.hasWeb) {
    steps.push(
      spawnStep(
        "bootstrap-apps-web",
        "Add Next.js app at apps/web",
        configuration.packageManager,
        nextAppArguments(configuration, "apps/web"),
        targetDirectory,
      ),
    );
  }

  if (configuration.stacks.hasMobile) {
    steps.push(
      spawnStep(
        "bootstrap-apps-mobile",
        "Add Expo app at apps/mobile",
        configuration.packageManager,
        expoAppArguments("apps/mobile"),
        targetDirectory,
      ),
    );
  }

  return steps;
}

/** Render a bootstrap command or deferred slot description for the plan display. */
export function formatBootstrapCommand(step: BootstrapStep): string {
  if (step.command === "(slot)") {
    return step.description;
  }

  const parts = [step.command, ...step.commandArguments].filter(Boolean);
  return parts.join(" ");
}
