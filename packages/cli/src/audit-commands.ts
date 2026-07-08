import { Command, type Command as CommanderCommand } from "commander";
import type { GlobalCliFlags } from "./cli-options.js";
import { registerAuditTailCommand } from "./register-audit-tail-command.js";
import { registerAuditExportCommand } from "./register-audit-export-command.js";
import { registerAuditVerifyCommand } from "./register-audit-verify-command.js";

export function registerAuditCommands(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: Parameters<typeof registerAuditTailCommand>[1]["resolveApi"];
  },
): void {
  const audit = program.command("audit").description("Audit event feed and export verification");

  registerAuditTailCommand(audit, deps);
  registerAuditExportCommand(audit, deps);
  registerAuditVerifyCommand(audit, deps);
}
