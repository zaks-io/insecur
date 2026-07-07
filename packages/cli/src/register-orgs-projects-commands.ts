import type { Command, Command as CommanderCommand } from "commander";
import { runOrgsListCommand } from "./commands/orgs-list.js";
import { runProjectsCreateCommand } from "./commands/projects-create.js";
import { runProjectsListCommand } from "./commands/projects-list.js";
import type { GlobalCliFlags } from "./cli-options.js";

interface NavigationDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runOrgsListCommand>[1];
    context: Parameters<typeof runOrgsListCommand>[2];
  }>;
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
    .requiredOption("--project-id <id>", "client-minted project opaque id")
    .option("--display-name-stdin", "read the Display Name from stdin")
    .action(async function projectsCreateAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{ projectId: string; displayNameStdin?: boolean }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runProjectsCreateCommand(flags, api, context, {
        projectId: options.projectId,
        displayNameStdin: options.displayNameStdin === true,
      });
    });
}
