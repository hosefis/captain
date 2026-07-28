import type { Command } from "commander";

export interface GlobalCliOptions {
  config?: string;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  verifyDocs?: boolean;
  force?: boolean;
}

export function getGlobalOptions(command: Command): GlobalCliOptions {
  const opts = command.optsWithGlobals() as {
    config?: string;
    yes?: boolean;
    dryRun?: boolean;
    json?: boolean;
    verifyDocs?: boolean;
    force?: boolean;
  };

  return {
    config: opts.config,
    yes: opts.yes ?? false,
    dryRun: opts.dryRun ?? false,
    json: opts.json ?? false,
    verifyDocs: opts.verifyDocs ?? false,
    force: opts.force ?? false,
  };
}

export function exitStub(commandName: string): never {
  console.error(`${commandName} is not yet implemented.`);
  process.exit(1);
}
