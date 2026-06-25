import type { Command, Command as CommanderCommand } from "commander";
import { runRunCommand } from "./commands/run.js";
import type { GlobalCliFlags } from "./cli-options.js";

export function registerRunCommand(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runRunCommand>[1];
      context: Parameters<typeof runRunCommand>[2];
    }>;
  },
): void {
  program
    .command("run")
    .description("Run a command with one exact variable key injected from a fresh grant")
    .requiredOption("--variable-key <key>", "application variable key to inject (e.g. API_KEY)")
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async function runAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{ variableKey: string }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runRunCommand(flags, api, context, {
        variableKey: options.variableKey,
        command: command.args,
      });
    });
}
