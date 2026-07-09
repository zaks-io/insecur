import { Command, type Command as CommanderCommand } from "commander";
import { runConfigSetCommand } from "./commands/config-set.js";
import { runConfigShowCommand } from "./commands/config-show.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { loadAndResolveCliContext } from "./config/load-cli-context.js";

export function registerConfigCommands(
  program: Command,
  globalFlags: (command: CommanderCommand) => GlobalCliFlags,
): void {
  const config = program.command("config").description("Local CLI configuration");

  config
    .command("show")
    .description("Show resolved local CLI configuration (metadata-only)")
    .action(async function configShowAction(_args, command: CommanderCommand) {
      const flags = globalFlags(command);
      const context = await loadAndResolveCliContext(flags);
      process.exitCode = runConfigShowCommand(flags, context);
    });

  config
    .command("set")
    .description("Write durable local CLI configuration")
    .argument("<key>", "config key (default-env-id, branch-env.<branch>, or crash-reports)")
    .argument("<value>", "config value")
    .action(async function configSetAction(
      key: string,
      value: string,
      _options: unknown,
      command: CommanderCommand,
    ) {
      const flags = globalFlags(command);
      process.exitCode = await runConfigSetCommand(flags, key, value);
    });
}
