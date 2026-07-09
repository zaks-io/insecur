import { VALIDATION_ERROR_CODES, type ProjectId } from "@insecur/domain";
import type { Command, Command as CommanderCommand } from "commander";
import { runOrgsListCommand } from "./commands/orgs-list.js";
import { runProjectsCreateCommand } from "./commands/projects-create.js";
import { runProjectsListCommand } from "./commands/projects-list.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { CliError } from "./output/cli-error.js";
import { EXIT_VALIDATION } from "./output/exit-codes.js";

interface NavigationDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runOrgsListCommand>[1];
    context: Parameters<typeof runOrgsListCommand>[2];
  }>;
}

function requireCreateProjectId(
  options: { readonly projectId?: string },
  flags: GlobalCliFlags,
): string | ProjectId {
  const projectId = options.projectId ?? flags.projectId;
  if (projectId === undefined) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "--project-id is required. Pass a client-minted project opaque id.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  return projectId;
}

export function registerOrgsCommands(program: Command, deps: NavigationDeps): void {
  const orgs = program.command("orgs").description("Organization navigation");

  orgs
    .command("list")
    .description("List organizations for the authenticated session")
    .action(async function orgsListAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runOrgsListCommand(flags, api, context);
    });
}

export function registerProjectsCommands(program: Command, deps: NavigationDeps): void {
  const projects = program.command("projects").description("Project navigation and creation");

  projects
    .command("list")
    .description("List projects in the resolved organization")
    .action(async function projectsListAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runProjectsListCommand(flags, api, context);
    });

  projects
    .command("create")
    .description("Create a project with a client-minted opaque ID")
    .option("--project-id <id>", "client-minted project opaque id")
    .option("--display-name-stdin", "read the Display Name from stdin")
    .action(async function projectsCreateAction(this: CommanderCommand) {
      const flags = deps.globalFlags(this);
      const options = this.opts<{ projectId?: string; displayNameStdin?: boolean }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runProjectsCreateCommand(flags, api, context, {
        projectId: requireCreateProjectId(options, flags),
        displayNameStdin: options.displayNameStdin === true,
      });
    });
}
