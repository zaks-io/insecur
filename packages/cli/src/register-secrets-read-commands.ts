import type { Command, Command as CommanderCommand } from "commander";
import { runSecretsListCommand } from "./commands/secrets-list.js";
import { runSecretsVersionsCommand } from "./commands/secrets-versions.js";
import type { GlobalCliFlags } from "./cli-options.js";

interface SecretsReadDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runSecretsListCommand>[0]["api"];
    context: Parameters<typeof runSecretsListCommand>[0]["context"];
  }>;
}

export function registerSecretsReadCommands(secrets: Command, deps: SecretsReadDeps): void {
  secrets
    .command("list")
    .description("List Secret Shapes in the resolved environment (metadata only)")
    .action(async function secretsListAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runSecretsListCommand({ flags, api, context });
    });

  secrets
    .command("versions")
    .description("List version metadata for one Secret (metadata only)")
    .argument("<secret-id>", "opaque Secret ID")
    .action(async function secretsVersionsAction(secretId: string, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runSecretsVersionsCommand({ flags, api, context }, { secretId });
    });
}
