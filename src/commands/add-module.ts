import type { Command } from "commander";
import { exitStub } from "../cli-options.js";

export function registerAddModuleCommand(program: Command): void {
  program
    .command("add-module")
    .description("Add an optional module to an existing project")
    .argument("<module>", "Module name (e.g. admin-catalog, form-wizard)")
    .action(() => {
      exitStub("add-module");
    });
}
