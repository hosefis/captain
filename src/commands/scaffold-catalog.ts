import { resolve } from "node:path";
import type { Command } from "commander";
import { scaffoldCatalogResource, parseCatalogFields } from "../generators/scaffold-catalog.js";
import { loadProjectConfigFromFile } from "../schema/project-config.js";

export function registerScaffoldCatalogCommand(program: Command): void {
  program
    .command("scaffold:catalog")
    .description("Scaffold an admin catalog resource from field definitions")
    .argument("<resource>", "Resource slug (e.g. billing-types)")
    .option(
      "--fields <fields>",
      "Comma-separated fields (e.g. name:string,description:string)",
      "",
    )
    .option("--archive", "Include archive/restore actions", false)
    .option("--project <path>", "Path to project.json", "project.json")
    .action((resource, options: { fields: string; archive: boolean; project: string }) => {
      const targetDir = process.cwd();
      const projectPath = resolve(targetDir, options.project);

      let config;
      try {
        config = loadProjectConfigFromFile(projectPath);
      } catch {
        console.error(`Could not read project config at ${projectPath}`);
        process.exit(1);
        return;
      }

      const fields = parseCatalogFields(options.fields);
      if (!fields) {
        console.error(
          'Invalid --fields. Example: --fields name:string,description:string,active:boolean',
        );
        process.exit(1);
        return;
      }

      const result = scaffoldCatalogResource({
        resourceSlug: resource,
        fields,
        archive: options.archive,
        targetDir,
        config,
      });

      if (!result.ok) {
        console.error(result.message);
        process.exit(1);
        return;
      }

      console.log(`Scaffolded admin catalog resource "${resource}":`);
      for (const file of result.files) {
        console.log(`  ${file}`);
      }
    });
}
