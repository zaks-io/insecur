import { VALIDATION_ERROR_CODES, type ProjectId } from "@insecur/domain";
import type { Command, Command as CommanderCommand } from "commander";
import { runOrgsListCommand } from "./commands/orgs-list.js";
import { runProjectsCreateCommand } from "./commands/projects-create.js";
import { runProjectsListCommand } from "./commands/projects-list.js";
import { runProjectsMigrateCommand } from "./commands/projects-migrate.js";
import type { ApiClient } from "./api/types.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { loadAndResolveCliContext } from "./config/load-cli-context.js";
import { openLocalStore } from "./local/open-local-store.js";
import { CliError } from "./output/cli-error.js";
import { EXIT_VALIDATION } from "./output/exit-codes.js";

export interface NavigationDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runOrgsListCommand>[1];
    context: Parameters<typeof runOrgsListCommand>[2];
  }>;
  readonly createHostedApi: (host: string) => ApiClient;
}

function collectRepeatable(value: string, previous: readonly string[]): readonly string[] {
  return [...previous, value];
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

  registerProjectsMigrateCommand(projects, deps);
}

function registerProjectsMigrateCommand(projects: Command, deps: NavigationDeps): void {
  projects
    .command("migrate")
    .description(
      "Migrate this Local Mode project to a Hosted Instance (one-way, verified-then-clean)",
    )
    .option("--org-id <id>", "target organization opaque id")
    .option(
      "--confirm-migrate",
      "scoped confirmation: verify every value remotely, then delete local copies",
    )
    .option("--yes", "answers ordinary prompts only; it cannot confirm a migration")
    .option(
      "--skip-key <variable-key>",
      "keep the remote value for a diverged Variable Key (repeatable)",
      collectRepeatable,
      [] as readonly string[],
    )
    .action(async function projectsMigrateAction(this: CommanderCommand) {
      const flags = deps.globalFlags(this);
      const options = this.opts<{
        orgId?: string;
        confirmMigrate?: boolean;
        yes?: boolean;
        skipKey: readonly string[];
      }>();
      const context = await loadAndResolveCliContext(flags);
      process.exitCode = await runProjectsMigrateCommand(
        flags,
        context,
        {
          orgId: options.orgId,
          confirmMigrate: options.confirmMigrate === true,
          yes: options.yes === true,
          skipKeys: options.skipKey,
        },
        {
          openStore: () => openLocalStore(),
          createCloudApi: deps.createHostedApi,
        },
      );
    });
}
