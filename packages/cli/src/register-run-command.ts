import type { Command, Command as CommanderCommand } from "commander";
import { runRunCommand } from "./commands/run.js";
import { parseRunCommandArgv } from "./commands/resolve-run-profile.js";
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
    .description(
      "Run a command with runtime injection from a CLI profile policy or one exact variable key",
    )
    .argument("[profile]", "CLI profile slug or id (uses defaultRunPolicyId)")
    .option("--variable-key <key>", "application variable key to inject (First Value path)")
    .option("--policy-id <id>", "runtime injection policy id (overrides profile default)")
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async function runAction(
      profileArg: string | undefined,
      _options: unknown,
      command: CommanderCommand,
    ) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{ variableKey?: string; policyId?: string }>();
      const parsed = parseRunCommandArgv({
        ...(profileArg === undefined ? {} : { positionalProfile: profileArg }),
        args: command.args,
      });
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runRunCommand(flags, api, context, {
        ...(options.variableKey === undefined ? {} : { variableKey: options.variableKey }),
        ...(options.policyId === undefined ? {} : { policyIdOverride: options.policyId }),
        ...(parsed.profileSelector === undefined
          ? {}
          : { profileSelector: parsed.profileSelector }),
        command: parsed.command,
      });
    });
}
