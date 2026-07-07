import type { Command, Command as CommanderCommand } from "commander";
import { runAuditExportCommand } from "./commands/audit-export.js";
import type { GlobalCliFlags } from "./cli-options.js";

export function registerAuditExportCommand(
  audit: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runAuditExportCommand>[1];
      context: Parameters<typeof runAuditExportCommand>[2];
    }>;
  },
): void {
  audit
    .command("export")
    .description("Export tenant-bounded audit events as JSONL with a signed manifest")
    .requiredOption("--from <iso8601>", "include events at or after this timestamp")
    .requiredOption("--to <iso8601>", "include events at or before this timestamp")
    .action(async function auditExportAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{ from: string; to: string }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runAuditExportCommand(flags, api, context, options);
    });
}
