import type { Command } from "commander";
import { migrateToMonorepo } from "../executor/migrate-to-monorepo.js";
import type { App } from "../schema/project-config.js";
import { getGlobalOptions } from "../cli-options.js";

function parseAddApp(value: string): App {
  if (value === "web" || value === "mobile" || value === "desktop") {
    return value;
  }
  throw new Error(`Invalid app "${value}" — use web, mobile, or desktop`);
}

export function registerMigrateToMonorepoCommand(program: Command): void {
  program
    .command("migrate:to-monorepo")
    .description("Hoist standalone packages into a Turborepo monorepo")
    .option("--add <app>", "Add an app slot (e.g. mobile)")
    .option("--project <path>", "Path to project.json", "project.json")
    .action(async (options: { add?: string; project: string }, command: Command) => {
      const globals = getGlobalOptions(command);
      const targetDir = process.cwd();
      let addApp: App | undefined;

      if (options.add) {
        try {
          addApp = parseAddApp(options.add);
        } catch (error) {
          console.error(error instanceof Error ? error.message : "Invalid --add value");
          process.exit(1);
          return;
        }
      }

      const result = await migrateToMonorepo({
        targetDir,
        projectPath: options.project,
        addApp,
        force: globals.force,
        dryRun: globals.dryRun,
      });

      if (!result.ok) {
        console.error(result.message);
        process.exit(1);
        return;
      }

      if (globals.json) {
        console.log(
          JSON.stringify(
            { status: result.planned ? "planned" : "success", ...result },
            null,
            2,
          ),
        );
        return;
      }

      console.log(
        result.planned
          ? "Would migrate project to monorepo topology."
          : "Migrated project to monorepo topology.",
      );
      console.log(`Apps: ${result.config.apps.join(", ")}`);
      if (result.addedApps.length > 0) {
        console.log(`Added apps: ${result.addedApps.join(", ")}`);
      }
    });
}
