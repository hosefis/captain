import type { Command } from "commander";
import { getGlobalOptions } from "../cli-options.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Scaffold a new CAPTAIN project")
    .argument("[directory]", "Target directory", ".")
    .action((directory: string, _options: unknown, command: Command) => {
      const globals = getGlobalOptions(command);

      if (globals.json) {
        console.log(
          JSON.stringify({
            command: "init",
            directory,
            status: "not_implemented",
            message: "Init bootstrap is not yet wired (Milestone 2).",
            options: globals,
          }),
        );
      } else {
        console.error("Init bootstrap is not yet wired (Milestone 2).");
        if (globals.config) {
          console.error(`Config: ${globals.config}`);
        }
        if (globals.dryRun) {
          console.error("Dry-run requested — resolver and bootstrap pending.");
        }
      }

      process.exit(1);
    });
}
