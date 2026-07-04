import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { registerAddModuleCommand } from "./commands/add-module.js";
import { registerInitCommand } from "./commands/init.js";
import { registerMigrateToMonorepoCommand } from "./commands/migrate-to-monorepo.js";
import { registerScaffoldCatalogCommand } from "./commands/scaffold-catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf8"),
) as { version: string };

const program = new Command()
  .name("captain")
  .description(
    "CAPTAIN — Create Apps Properly: Templates, Adapters, Integrations, Now",
  )
  .version(packageJson.version)
  .option("--config <path>", "Agent input: path to project.json")
  .option("--yes", "Accept defaults and skip confirmations")
  .option("--dry-run", "Print execution plan without making changes")
  .option("--json", "Emit machine-readable output")
  .option(
    "--verify-docs",
    "Report npm-latest vs bundled recipe version drift",
  );

registerInitCommand(program);
registerAddModuleCommand(program);
registerScaffoldCatalogCommand(program);
registerMigrateToMonorepoCommand(program);

program.parse();
