import type { Command } from "commander";

export interface GlobalCliOptions {
  config?: string;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  verifyDocs?: boolean;
}

/** Read global flags with consistent defaults from any CLI command. */
export function getGlobalOptions(command: Command): GlobalCliOptions {
  const options = command.optsWithGlobals() as {
    config?: string;
    yes?: boolean;
    dryRun?: boolean;
    json?: boolean;
    verifyDocs?: boolean;
  };

  return {
    config: options.config,
    yes: options.yes ?? false,
    dryRun: options.dryRun ?? false,
    json: options.json ?? false,
    verifyDocs: options.verifyDocs ?? false,
  };
}

/** Report an unavailable command and stop with a failure status. */
export function exitStub(commandName: string): never {
  console.error(`${commandName} is not yet implemented.`);
  process.exit(1);
}
