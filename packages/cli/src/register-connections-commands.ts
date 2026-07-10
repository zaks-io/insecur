import type { Command, Command as CommanderCommand } from "commander";
import { runConnectionsCreateCommand } from "./commands/connections-create.js";
import { runConnectionsDisconnectCommand } from "./commands/connections-disconnect.js";
import { runConnectionsListCommand } from "./commands/connections-list.js";
import { runConnectionsReauthCommand } from "./commands/connections-reauth.js";
import { runConnectionsRotateCommand } from "./commands/connections-rotate.js";
import { runConnectionsStatusCommand } from "./commands/connections-status.js";
import type { GlobalCliFlags } from "./cli-options.js";

interface ConnectionsDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runConnectionsListCommand>[1];
    context: Parameters<typeof runConnectionsListCommand>[2];
  }>;
}

export function registerConnectionsCommands(program: Command, deps: ConnectionsDeps): void {
  const connections = program
    .command("connections")
    .description("Manage org-scoped App Connections (metadata only)");

  registerConnectionsListCommand(connections, deps);
  registerConnectionsCreateCommand(connections, deps);
  registerConnectionsStatusCommand(connections, deps);
  registerConnectionsRotateCommand(connections, deps);
  registerConnectionsReauthCommand(connections, deps);
  registerConnectionsDisconnectCommand(connections, deps);
}

function registerConnectionsListCommand(connections: Command, deps: ConnectionsDeps): void {
  connections
    .command("list")
    .description("List App Connections for the selected organization")
    .action(async function connectionsListAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runConnectionsListCommand(flags, api, context);
    });
}

function registerConnectionsCreateCommand(connections: Command, deps: ConnectionsDeps): void {
  connections
    .command("create")
    .description("Create an App Connection via provider authorization or scoped token input")
    .argument("<provider>", "provider slug (github, cloudflare, vercel)")
    .requiredOption("--connection-id <id>", "client-minted app connection opaque id")
    .requiredOption("--method <method>", "connection method (github-app, scoped-api-token, ...)")
    .option("--display-name-stdin", "read the Display Name from stdin")
    .option("--value-stdin", "read provider token from stdin (credential-backed methods)")
    .option("--token <value>", "REJECTED: provider tokens must not be passed on argv")
    .option("--allow-account-id <id>", "Cloudflare allowed account id (boundary)")
    .option("--allow-worker-script <name>", "Cloudflare allowed Worker script (boundary)")
    .option("--installation-id <id>", "GitHub App installation id (boundary)")
    .option("--owner <name>", "GitHub owner login (boundary)")
    .option("--allowed-repositories <repos>", "comma-separated GitHub repository names (boundary)")
    .option("--operation <id>", "resume after High-Assurance Challenge clearance")
    .action(async function connectionsCreateAction(provider: string, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        connectionId: string;
        method: string;
        displayNameStdin?: boolean;
        valueStdin?: boolean;
        token?: string;
        allowAccountId?: string;
        allowWorkerScript?: string;
        installationId?: string;
        owner?: string;
        allowedRepositories?: string;
        operation?: string;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runConnectionsCreateCommand(flags, api, context, {
        provider,
        connectionId: options.connectionId,
        method: options.method,
        displayNameStdin: options.displayNameStdin === true,
        valueStdin: options.valueStdin === true,
        token: options.token,
        allowAccountId: options.allowAccountId,
        allowWorkerScript: options.allowWorkerScript,
        installationId: options.installationId,
        owner: options.owner,
        allowedRepositories: options.allowedRepositories,
        operationId: options.operation,
      });
    });
}

function registerConnectionsStatusCommand(connections: Command, deps: ConnectionsDeps): void {
  connections
    .command("status")
    .description("Show metadata-only App Connection status")
    .argument("<connection-id>", "app connection opaque id")
    .action(async function connectionsStatusAction(
      connectionId: string,
      command: CommanderCommand,
    ) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runConnectionsStatusCommand(flags, api, context, connectionId);
    });
}

function registerConnectionsRotateCommand(connections: Command, deps: ConnectionsDeps): void {
  connections
    .command("rotate")
    .description("Rotate credential-backed App Connection provider credentials")
    .argument("<connection-id>", "app connection opaque id")
    .option("--dry-run", "validate the active credential without replacing it")
    .option("--value-stdin", "read replacement provider token from stdin")
    .option("--token <value>", "REJECTED: provider tokens must not be passed on argv")
    .option("--operation <id>", "resume after High-Assurance Challenge clearance")
    .action(async function connectionsRotateAction(
      connectionId: string,
      command: CommanderCommand,
    ) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        dryRun?: boolean;
        valueStdin?: boolean;
        token?: string;
        operation?: string;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runConnectionsRotateCommand(flags, api, context, {
        connectionId,
        dryRun: options.dryRun === true,
        valueStdin: options.valueStdin === true,
        token: options.token,
        operationId: options.operation,
      });
    });
}

function registerConnectionsReauthCommand(connections: Command, deps: ConnectionsDeps): void {
  connections
    .command("reauth")
    .description("Reauthorize an App Connection with audit")
    .argument("<connection-id>", "app connection opaque id")
    .option("--installation-id <id>", "GitHub App installation id (boundary override)")
    .option("--owner <name>", "GitHub owner login (boundary override)")
    .option("--allowed-repositories <repos>", "comma-separated GitHub repository names (boundary)")
    .option("--operation <id>", "resume after High-Assurance Challenge clearance")
    .action(async function connectionsReauthAction(
      connectionId: string,
      command: CommanderCommand,
    ) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        installationId?: string;
        owner?: string;
        allowedRepositories?: string;
        operation?: string;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runConnectionsReauthCommand(flags, api, context, {
        connectionId,
        operationId: options.operation,
        installationId: options.installationId,
        owner: options.owner,
        allowedRepositories: options.allowedRepositories,
      });
    });
}

function registerConnectionsDisconnectCommand(connections: Command, deps: ConnectionsDeps): void {
  connections
    .command("disconnect")
    .description("Disconnect an App Connection with audit")
    .argument("<connection-id>", "app connection opaque id")
    .action(async function connectionsDisconnectAction(
      connectionId: string,
      command: CommanderCommand,
    ) {
      const flags = deps.globalFlags(command);
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runConnectionsDisconnectCommand(flags, api, context, connectionId);
    });
}
