import { Command, type Command as CommanderCommand } from "commander";
import { runAuditVerifyCommand } from "./commands/audit-verify.js";
import type { GlobalCliFlags } from "./cli-options.js";
import { registerAuditTailCommand } from "./register-audit-tail-command.js";
import { registerAuditExportCommand } from "./register-audit-export-command.js";

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

  audit
    .command("verify")
    .description("Verify a tamper-evident audit export JSONL bundle and manifest")
    .argument("<jsonl>", "path to audit export JSONL")
    .requiredOption("--manifest <path>", "path to audit export manifest JSON")
    .option("--hmac-secret-env <name>", "env var holding the audit export HMAC secret")
    .option(
      "--signing-public-key-env <name>",
      "env var holding the published audit export signing public key",
    )
    .action(async function auditVerifyAction(jsonlPath: string, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        manifest: string;
        hmacSecretEnv?: string;
        signingPublicKeyEnv?: string;
      }>();
      process.exitCode = await runAuditVerifyCommand(flags, jsonlPath, {
        manifestPath: options.manifest,
        ...(options.hmacSecretEnv === undefined ? {} : { hmacSecretEnv: options.hmacSecretEnv }),
        ...(options.signingPublicKeyEnv === undefined
          ? {}
          : { signingPublicKeyEnv: options.signingPublicKeyEnv }),
      });
    });
}
