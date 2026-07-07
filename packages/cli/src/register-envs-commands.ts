import type { Command, Command as CommanderCommand } from "commander";
import { runEnvsCreateCommand } from "./commands/envs-create.js";
import { runEnvsListCommand } from "./commands/envs-list.js";
import type { GlobalCliFlags } from "./cli-options.js";

interface NavigationDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runEnvsListCommand>[1];
    context: Parameters<typeof runEnvsListCommand>[2];
  }>;
}

export function registerEnvsCommands(program: Command, deps: NavigationDeps): void {
  const envs = program.command("envs").description("Environment navigation and creation");

  envs
    .command("list")
    .description("List environments in the resolved project")
    .action(async function envsListAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runEnvsListCommand(flags, api, context);
    });

  envs
    .command("create")
    .description("Create a non-protected development environment")
    .requiredOption("--env-id <id>", "client-minted environment opaque id")
    .option("--display-name-stdin", "read the Display Name from stdin")
    .option(
      "--copy-shapes-from-env-id <id>",
      "copy Secret Shapes only from another environment in the same project",
    )
    .action(async function envsCreateAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        envId: string;
        displayNameStdin?: boolean;
        copyShapesFromEnvId?: string;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runEnvsCreateCommand(flags, api, context, {
        envId: options.envId,
        displayNameStdin: options.displayNameStdin === true,
        copyShapesFromEnvId: options.copyShapesFromEnvId,
      });
    });
}
