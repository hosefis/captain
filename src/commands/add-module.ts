import type { Command } from "commander";
import { addModuleToProject } from "../executor/add-module.js";
import { getGlobalOptions } from "../cli-options.js";

export function registerAddModuleCommand(program: Command): void {
  program
    .command("add-module")
    .description("Add an optional module to an existing project")
    .argument("<module>", "Module name (e.g. admin-catalog, form-wizard)")
    .option("--project <path>", "Path to project.json", "project.json")
    .action((moduleName, options: { project: string }, command: Command) => {
      const globals = getGlobalOptions(command);
      const targetDir = process.cwd();
      const result = addModuleToProject({
        moduleName,
        targetDir,
        projectPath: options.project,
        force: globals.force,
        dryRun: globals.dryRun,
      });

      if (!result.ok) {
        console.error(result.message);
        process.exit(1);
        return;
      }

      if (globals.json) {
        console.log(JSON.stringify({ status: result.planned ? "planned" : "success", ...result }, null, 2));
        return;
      }

      console.log(
        result.planned
          ? `Would add module "${result.module}".`
          : `Added module "${result.module}".`,
      );
      console.log("Applied recipes:");
      for (const recipe of result.appliedRecipes) {
        console.log(`  ${recipe}`);
      }
    });
}
