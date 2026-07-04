import type { Command } from "commander";
import { exitStub } from "../cli-options.js";

export function registerMigrateToMonorepoCommand(program: Command): void {
  program
    .command("migrate:to-monorepo")
    .description("Hoist standalone packages into a Turborepo monorepo")
    .option("--add <app>", "Add an app slot (e.g. mobile)")
    .action(() => {
      exitStub("migrate:to-monorepo");
    });
}
