import type { Command, Command as CommanderCommand } from "commander";
import { runSecretsSetCommand } from "./commands/secrets-set.js";
import type { GlobalCliFlags } from "./cli-options.js";

export function registerSecretsCommands(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runSecretsSetCommand>[1];
      context: Parameters<typeof runSecretsSetCommand>[2];
    }>;
  },
): void {
  const secrets = program
    .command("secrets")
    .description("Blind secret writes and metadata-only management");

  secrets
    .command("set")
    .description("Create or update a non-protected secret by variable key")
    .requiredOption("--variable-key <key>", "application variable key (e.g. API_KEY)")
    .option("--generate [mode]", "service-generate a secret value (default mode: random)")
    .option("--length <bytes>", "random byte length for --generate random", "32")
    .option("--value-stdin", "read the secret value from stdin")
    .option("--allow-empty", "allow an intentionally empty secret value")
    .action(async function secretsSetAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        variableKey: string;
        generate?: string | true;
        length?: string;
        valueStdin?: boolean;
        allowEmpty?: boolean;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runSecretsSetCommand(flags, api, context, {
        variableKey: options.variableKey,
        generateMode: options.generate,
        generateLength: options.length,
        valueStdin: options.valueStdin === true,
        allowEmpty: options.allowEmpty === true,
      });
    });
}
