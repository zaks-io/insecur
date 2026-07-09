import type { Command as CommanderCommand } from "commander";
import { runAuditVerifyCommand, type AuditVerifyCommandOptions } from "./commands/audit-verify.js";
import type { GlobalCliFlags } from "./cli-options.js";

function auditVerifyOptionsFromCommand(command: CommanderCommand): AuditVerifyCommandOptions {
  const options = command.opts<{
    manifest: string;
    hmacSecretEnv?: string;
    signingPublicKeyEnv?: string;
    publishedSigningKeys?: string;
    publishedSigningKeysEnv?: string;
  }>();
  return {
    manifestPath: options.manifest,
    ...(options.hmacSecretEnv === undefined ? {} : { hmacSecretEnv: options.hmacSecretEnv }),
    ...(options.signingPublicKeyEnv === undefined
      ? {}
      : { signingPublicKeyEnv: options.signingPublicKeyEnv }),
    ...(options.publishedSigningKeys === undefined
      ? {}
      : { publishedSigningKeysPath: options.publishedSigningKeys }),
    ...(options.publishedSigningKeysEnv === undefined
      ? {}
      : { publishedSigningKeysEnv: options.publishedSigningKeysEnv }),
  };
}

export function registerAuditVerifyCommand(
  audit: CommanderCommand,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
  },
): void {
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
    .option(
      "--published-signing-keys <path>",
      "path or URL to the published audit export signing public keys JSON",
    )
    .option(
      "--published-signing-keys-env <name>",
      "env var holding the path or URL to published signing public keys",
    )
    .action(async function auditVerifyAction(this: CommanderCommand, jsonlPath: string) {
      const flags = deps.globalFlags(this);
      process.exitCode = await runAuditVerifyCommand(
        flags,
        jsonlPath,
        auditVerifyOptionsFromCommand(this),
      );
    });
}
