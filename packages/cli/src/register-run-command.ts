import type { Command, Command as CommanderCommand } from "commander";
import { commanderRawArgv } from "./commander-argv.js";
import { runRunCommand } from "./commands/run.js";
import {
  isExplicitProfilePositional,
  reconcileProfileRunCommand,
} from "./commands/resolve-run-profile.js";
import type { ProgramDeps } from "./program-deps.js";

export function registerRunCommand(program: Command, deps: ProgramDeps): void {
  program
    .command("run")
    .description(
      "Run a command with runtime injection from a CLI profile policy or one exact variable key",
    )
    .addHelpText(
      "after",
      "\nUsage: insecur run [profile] -- <command...>\n\n" +
        "The `--` separator is required when the child command could be mistaken for a profile " +
        "slug or when using --variable-key without a profile argument.\n",
    )
    .argument("[profile]", "CLI profile slug or id (uses defaultRunPolicyId)")
    .option("--variable-key <key>", "application variable key to inject (First Value path)")
    .option("--policy-id <id>", "runtime injection policy id (overrides profile default)")
    .option("--watch", "restart the child on file changes (development environment only)")
    .allowUnknownOption()
    .allowExcessArguments()
    .action(async (profileArg: string | undefined, _options: unknown, command: CommanderCommand) =>
      runAction(profileArg, command, deps),
    );
}

async function runAction(
  profileArg: string | undefined,
  command: CommanderCommand,
  deps: ProgramDeps,
): Promise<void> {
  const flags = deps.globalFlags(command);
  const options = command.opts<{ variableKey?: string; policyId?: string; watch?: boolean }>();
  const { api, context, dispose } = await deps.resolveApi(flags);
  try {
    const parsed = reconcileProfileRunCommand({
      flags,
      context,
      ...(options.variableKey === undefined ? {} : { variableKey: options.variableKey }),
      explicitProfilePositional: isExplicitProfilePositional(commanderRawArgv(command), profileArg),
      ...(profileArg === undefined ? {} : { positionalProfile: profileArg }),
      args: command.args,
    });
    process.exitCode = await runRunCommand(flags, api, context, {
      ...(options.variableKey === undefined ? {} : { variableKey: options.variableKey }),
      ...(options.policyId === undefined ? {} : { policyIdOverride: options.policyId }),
      ...(options.watch === true ? { watch: true } : {}),
      ...(parsed.profileSelector === undefined ? {} : { profileSelector: parsed.profileSelector }),
      command: parsed.command,
    });
  } finally {
    dispose?.();
  }
}
