import type { NormalizedProjectConfig, PackageManager } from "../schema/project-config.js";

export type BootstrapStep = {
  id: string;
  description: string;
  command: string;
  args: string[];
  cwd: string;
};

function dlxCommand(packageManager: PackageManager): string {
  if (packageManager === "npm") {
    return "npx";
  }
  if (packageManager === "bun") {
    return "bunx";
  }
  return "pnpm dlx";
}

function nextAppArgs(config: NormalizedProjectConfig, targetDir: string): string[] {
  const useFlag =
    config.packageManager === "pnpm"
      ? "--use-pnpm"
      : config.packageManager === "bun"
        ? "--use-bun"
        : "--use-npm";

  return [
    "create-next-app@latest",
    targetDir,
    "--typescript",
    "--tailwind",
    "--eslint",
    "--app",
    "--yes",
    useFlag,
  ];
}

function expoAppArgs(targetDir: string): string[] {
  return ["create-expo-app@latest", targetDir, "--template", "blank-typescript"];
}

function spawnStep(
  id: string,
  description: string,
  packageManager: PackageManager,
  args: string[],
  cwd: string,
): BootstrapStep {
  const dlx = dlxCommand(packageManager);
  const [command, ...dlxPrefix] = dlx.split(" ");

  return {
    id,
    description,
    command: command ?? dlx,
    args: [...dlxPrefix, ...args],
    cwd,
  };
}

export function resolveBootstrapPlan(
  config: NormalizedProjectConfig,
  targetDirectory: string,
): BootstrapStep[] {
  const steps: BootstrapStep[] = [];

  if (config.topology === "web") {
    steps.push(
      spawnStep(
        "bootstrap-web",
        "Scaffold Next.js app (TypeScript, App Router, Tailwind, ESLint)",
        config.packageManager,
        nextAppArgs(config, "."),
        targetDirectory,
      ),
    );
    return steps;
  }

  if (config.topology === "mobile") {
    steps.push(
      spawnStep(
        "bootstrap-mobile",
        "Scaffold Expo app (blank-typescript template)",
        config.packageManager,
        expoAppArgs("."),
        targetDirectory,
      ),
    );
    return steps;
  }

  steps.push(
    spawnStep(
      "bootstrap-monorepo",
      "Scaffold Turborepo monorepo base",
      config.packageManager,
      ["create-turbo@latest", "."],
      targetDirectory,
    ),
  );

  if (config.stacks.hasWeb) {
    steps.push(
      spawnStep(
        "bootstrap-apps-web",
        "Add Next.js app at apps/web",
        config.packageManager,
        nextAppArgs(config, "apps/web"),
        targetDirectory,
      ),
    );
  }

  if (config.stacks.hasMobile) {
    steps.push(
      spawnStep(
        "bootstrap-apps-mobile",
        "Add Expo app at apps/mobile",
        config.packageManager,
        expoAppArgs("apps/mobile"),
        targetDirectory,
      ),
    );
  }

  if (config.stacks.hasDesktop) {
    steps.push({
      id: "bootstrap-apps-desktop",
      description: "Reserve apps/desktop slot (Electron bootstrap deferred to v1)",
      command: "(slot)",
      args: [],
      cwd: targetDirectory,
    });
  }

  return steps;
}

export function formatBootstrapCommand(step: BootstrapStep): string {
  if (step.command === "(slot)") {
    return step.description;
  }

  const parts = [step.command, ...step.args].filter(Boolean);
  return parts.join(" ");
}
