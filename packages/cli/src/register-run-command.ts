import type { Command, Command as CommanderCommand } from "commander";
import { runRunCommand } from "./commands/run.js";
import {
  isExplicitProfilePositional,
  reconcileProfileRunCommand,
} from "./commands/resolve-run-profile.js";
import type { GlobalCliFlags } from "./cli-options.js";

/**
 * Commander sets `rawArgs` on the parsing command at runtime but leaves it out of the public
 * typings. Guarded structural access; if a commander upgrade ever drops it, the wizard-shape
 * commander regression test fails loudly rather than this silently misclassifying.
 */
function commandRawArgs(command: CommanderCommand | null | undefined): readonly string[] {
  if (command === null || command === undefined) {
    return [];
  }
  const raw = (command as unknown as { rawArgs?: unknown }).rawArgs;
  return Array.isArray(raw) && raw.every((token) => typeof token === "string") ? raw : [];
}

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
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runRunCommand>[1];
      context: Parameters<typeof runRunCommand>[2];
    }>;
  },
): Promise<void> {
  const flags = deps.globalFlags(command);
  const options = command.opts<{ variableKey?: string; policyId?: string; watch?: boolean }>();
  const { api, context } = await deps.resolveApi(flags);
  const parsed = reconcileProfileRunCommand({
    flags,
    context,
    ...(options.variableKey === undefined ? {} : { variableKey: options.variableKey }),
    explicitProfilePositional: isExplicitProfilePositional(
      commandRawArgs(command.parent),
      profileArg,
    ),
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
}
