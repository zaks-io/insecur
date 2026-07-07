import type { Command, Command as CommanderCommand } from "commander";
import { runImportCommand } from "./commands/import.js";
import { runLocalFilesRmCommand } from "./commands/local-files-rm.js";
import type { GlobalCliFlags } from "./cli-options.js";

export function registerImportCommands(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runImportCommand>[1];
      context: Parameters<typeof runImportCommand>[2];
    }>;
  },
): void {
  program
    .command("import")
    .description(
      "Import secrets from a local dotenv file into a development environment (create-only)",
    )
    .argument("<file>", "local dotenv file to import")
    .option("--dry-run", "run Import Preflight and return a metadata-only Secret Import Plan")
    .option(
      "--variable-key-prefix <prefix>",
      "prepend this prefix to every parsed dotenv key before validation",
    )
    .action(async function importAction(file: string, _args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{ dryRun?: boolean; variableKeyPrefix?: string }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runImportCommand(flags, api, context, {
        filePath: file,
        dryRun: options.dryRun === true,
        ...(options.variableKeyPrefix === undefined
          ? {}
          : { variableKeyPrefix: options.variableKeyPrefix }),
      });
    });

  const localFiles = program
    .command("local-files")
    .description("Local plaintext secret file utilities (metadata-only; no secure erasure)");

  localFiles
    .command("rm")
    .description("Delete a local file after explicit confirmation (ordinary filesystem delete)")
    .argument("<path>", "local file path to delete")
    .option("--yes", "skip the interactive confirmation prompt")
    .action(async function localFilesRmAction(path: string, _args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{ yes?: boolean }>();
      process.exitCode = await runLocalFilesRmCommand(flags, {
        filePath: path,
        yes: options.yes === true,
      });
    });
}
