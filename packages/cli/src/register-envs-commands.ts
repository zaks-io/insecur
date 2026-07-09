import { VALIDATION_ERROR_CODES, type EnvironmentId } from "@insecur/domain";
import type { Command, Command as CommanderCommand } from "commander";
import { runEnvsCreateCommand } from "./commands/envs-create.js";
import { runEnvsListCommand } from "./commands/envs-list.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { CliError } from "./output/cli-error.js";
import { EXIT_VALIDATION } from "./output/exit-codes.js";

interface NavigationDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runEnvsListCommand>[1];
    context: Parameters<typeof runEnvsListCommand>[2];
  }>;
}

function requireCreateEnvironmentId(
  options: { readonly envId?: string },
  flags: GlobalCliFlags,
): string | EnvironmentId {
  const envId = options.envId ?? flags.envId;
  if (envId === undefined) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "--env-id is required. Pass a client-minted environment opaque id.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  return envId;
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
    .option("--env-id <id>", "client-minted environment opaque id")
    .option("--display-name-stdin", "read the Display Name from stdin")
    .option(
      "--copy-shapes-from-env-id <id>",
      "copy Secret Shapes only from another environment in the same project",
    )
    .action(async function envsCreateAction(this: CommanderCommand) {
      const flags = deps.globalFlags(this);
      const options = this.opts<{
        envId?: string;
        displayNameStdin?: boolean;
        copyShapesFromEnvId?: string;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runEnvsCreateCommand(flags, api, context, {
        envId: requireCreateEnvironmentId(options, flags),
        displayNameStdin: options.displayNameStdin === true,
        copyShapesFromEnvId: options.copyShapesFromEnvId,
      });
    });
}
