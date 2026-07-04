import type { Command } from "commander";
import { exitStub } from "../cli-options.js";

export function registerScaffoldCatalogCommand(program: Command): void {
  program
    .command("scaffold:catalog")
    .description("Scaffold an admin catalog resource from field definitions")
    .argument("<resource>", "Resource slug (e.g. billing-types)")
    .option(
      "--fields <fields>",
      "Comma-separated fields (e.g. name:string,description:string)",
    )
    .option("--archive", "Include archive/restore actions")
    .action(() => {
      exitStub("scaffold:catalog");
    });
}
