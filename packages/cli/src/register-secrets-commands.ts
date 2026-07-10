import type { Command, Command as CommanderCommand } from "commander";
import { runSecretsSetCommand } from "./commands/secrets-set.js";
import { runSecretsPromoteCommand } from "./commands/secrets-promote.js";
import { runSecretsRollbackCommand } from "./commands/secrets-rollback.js";
import { requireTargetEnvironmentId } from "./commands/navigation-scope.js";
import { registerImportCommands } from "./register-import-commands.js";
import { registerSecretsReadCommands } from "./register-secrets-read-commands.js";
import type { ProgramDeps } from "./program-deps.js";

export function registerSecretsCommands(program: Command, deps: ProgramDeps): void {
  const secrets = program
    .command("secrets")
    .description("Blind secret writes and metadata-only management");

  registerSecretsReadCommands(secrets, deps);

  secrets
    .command("set <variable-key>")
    .description("Create or update a non-protected secret by variable key")
    .option("--generate [mode]", "service-generate a secret value (default mode: random)")
    .option("--length <bytes>", "random byte length for --generate random", "32")
    .option("--value-stdin", "read the secret value from stdin")
    .option("--allow-empty", "allow an intentionally empty secret value")
    .option("--dry-run", "plan the metadata-only write without collecting or sending a value")
    .action(async function secretsSetAction(
      variableKey: string,
      _options: unknown,
      command: CommanderCommand,
    ) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        generate?: string | true;
        length?: string;
        valueStdin?: boolean;
        allowEmpty?: boolean;
        dryRun?: boolean;
      }>();
      const { api, context, dispose } = await deps.resolveApi(flags);
      try {
        process.exitCode = await runSecretsSetCommand(flags, api, context, {
          variableKey,
          generateMode: options.generate,
          generateLength: options.length,
          valueStdin: options.valueStdin === true,
          allowEmpty: options.allowEmpty === true,
          dryRun: options.dryRun === true,
        });
      } finally {
        dispose?.();
      }
    });

  registerSecretsPromoteCommand(secrets, deps);
  registerSecretsRollbackCommand(secrets, deps);

  registerImportCommands(program, deps);
}

function registerSecretsPromoteCommand(secrets: Command, deps: ProgramDeps): void {
  secrets
    .command("promote <draft-version-id...>")
    .description("Request protected promotion for exact draft versions (metadata only)")
    .option("--env-id <id>", "target environment opaque id")
    .option("--comment <text>", "audit comment")
    .option("--impact-review-fingerprint <hash>", "resume fingerprint from prior review")
    .option("--operation <id>", "resume after High-Assurance Challenge clearance")
    .action(async function secretsPromoteAction(
      draftVersionIds: string[],
      _options: unknown,
      command: CommanderCommand,
    ) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        envId?: string;
        comment?: string;
        impactReviewFingerprint?: string;
        operation?: string;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runSecretsPromoteCommand(flags, api, context, {
        envId: requireTargetEnvironmentId(options.envId, context.scope),
        draftVersionIds,
        comment: options.comment,
        impactReviewFingerprint: options.impactReviewFingerprint,
        operationId: options.operation,
      });
    });
}

function registerSecretsRollbackCommand(secrets: Command, deps: ProgramDeps): void {
  secrets
    .command("rollback <secret-id>")
    .description("Rollback a secret from a retained published version (metadata only)")
    .option("--env-id <id>", "target environment opaque id")
    .requiredOption("--to-version-id <id>", "retained published secret version opaque id")
    .option("--promote", "create draft and request promotion approval")
    .option("--comment <text>", "audit comment")
    .option("--operation <id>", "resume after High-Assurance Challenge clearance")
    .action(async function secretsRollbackAction(
      secretId: string,
      _args,
      command: CommanderCommand,
    ) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        envId?: string;
        toVersionId: string;
        promote?: boolean;
        comment?: string;
        operation?: string;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runSecretsRollbackCommand(flags, api, context, {
        secretId,
        envId: requireTargetEnvironmentId(options.envId, context.scope),
        toVersionId: options.toVersionId,
        promote: options.promote === true,
        comment: options.comment,
        operationId: options.operation,
      });
    });
}
