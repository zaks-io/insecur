import type { Command, Command as CommanderCommand } from "commander";
import { runScanCommand } from "./commands/scan.js";
import type { GlobalCliFlags } from "./cli-options.js";

export function registerScanCommand(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  },
): void {
  program
    .command("scan")
    .description("Offline project-scoped secret exposure report (metadata only)")
    .option("--strict", "exit with code 7 when likely secrets are found")
    .action(async function scanAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{ strict?: boolean }>();
      process.exitCode = await runScanCommand(flags, { strict: options.strict === true });
    });
}
