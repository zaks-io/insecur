import type { Command, Command as CommanderCommand } from "commander";
import { runAuditTailCommand } from "./commands/audit-tail.js";
import type { GlobalCliFlags } from "./cli-options.js";

export function registerAuditTailCommand(
  audit: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runAuditTailCommand>[1];
      context: Parameters<typeof runAuditTailCommand>[2];
    }>;
  },
): void {
  audit
    .command("tail")
    .description("Show recent tenant-bounded audit events (metadata-only)")
    .option("--limit <count>", "maximum events to return (default 25)")
    .option("--from <iso8601>", "include events at or after this timestamp")
    .option("--to <iso8601>", "include events before this timestamp")
    .option("--cursor <cursor>", "pagination cursor from a prior response")
    .option("--actor-user-id <id>", "filter by actor user id")
    .option("--actor-machine-identity-id <id>", "filter by actor machine identity id")
    .option("--project-id <id>", "filter by project id")
    .option("--env-id <id>", "filter by environment id")
    .option("--event-code <code>", "filter by audit event code")
    .action(async function auditTailAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        limit?: string;
        from?: string;
        to?: string;
        cursor?: string;
        actorUserId?: string;
        actorMachineIdentityId?: string;
        projectId?: string;
        envId?: string;
        eventCode?: string;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runAuditTailCommand(flags, api, context, options);
    });
}
