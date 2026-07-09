import { VALIDATION_ERROR_CODES, type EnvironmentId } from "@insecur/domain";
import type { Command, Command as CommanderCommand } from "commander";
import { runApprovalsListCommand } from "./commands/approvals-list.js";
import type { GlobalCliFlags } from "./cli-options.js";
import type { ResolvedCliContext } from "./config/load-cli-context.js";
import { CliError } from "./output/cli-error.js";
import { EXIT_VALIDATION } from "./output/exit-codes.js";

interface ApprovalsDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runApprovalsListCommand>[1];
    context: Parameters<typeof runApprovalsListCommand>[2];
  }>;
}

function requireApprovalsEnvironmentId(
  options: { readonly envId?: string },
  flags: GlobalCliFlags,
  context: ResolvedCliContext,
): string | EnvironmentId {
  const envId = options.envId ?? flags.envId ?? context.scope.envId;
  if (envId === undefined) {
    throw new CliError(
      {
        code: VALIDATION_ERROR_CODES.invalidCommandInput,
        message: "--env-id is required. Pass --env-id or run from a resolved environment profile.",
        retryable: false,
      },
      EXIT_VALIDATION,
    );
  }
  return envId;
}

export function registerApprovalsCommands(program: Command, deps: ApprovalsDeps): void {
  const approvals = program
    .command("approvals")
    .description("Metadata-only approval request status");

  approvals
    .command("list")
    .description("List approval requests for an environment")
    .option("--env-id <id>", "target environment opaque id")
    .action(async function approvalsListAction(this: CommanderCommand) {
      const flags = deps.globalFlags(this);
      const options = this.opts<{ envId?: string }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runApprovalsListCommand(flags, api, context, {
        envId: requireApprovalsEnvironmentId(options, flags, context),
      });
    });
}
