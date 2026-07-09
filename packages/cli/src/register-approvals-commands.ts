import type { Command, Command as CommanderCommand } from "commander";
import { runApprovalsListCommand } from "./commands/approvals-list.js";
import { requireTargetEnvironmentId } from "./commands/navigation-scope.js";
import type { GlobalCliFlags } from "./cli-options.js";

interface ApprovalsDeps {
  readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
    api: Parameters<typeof runApprovalsListCommand>[1];
    context: Parameters<typeof runApprovalsListCommand>[2];
  }>;
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
        envId: requireTargetEnvironmentId(options.envId, context.scope),
      });
    });
}
