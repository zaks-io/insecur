import type { Command, Command as CommanderCommand } from "commander";
import { runSecretsSetCommand } from "./commands/secrets-set.js";
import { runSecretsPromoteCommand } from "./commands/secrets-promote.js";
import { runSecretsRollbackCommand } from "./commands/secrets-rollback.js";
import { registerImportCommands } from "./register-import-commands.js";
import { registerSecretsReadCommands } from "./register-secrets-read-commands.js";
import type { GlobalCliFlags } from "./cli-options.js";

export function registerSecretsCommands(
  program: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runSecretsSetCommand>[1];
      context: Parameters<typeof runSecretsSetCommand>[2];
    }>;
  },
): void {
  const secrets = program
    .command("secrets")
    .description("Blind secret writes and metadata-only management");

  registerSecretsReadCommands(secrets, deps);

  secrets
    .command("set")
    .description("Create or update a non-protected secret by variable key")
    .requiredOption("--variable-key <key>", "application variable key (e.g. API_KEY)")
    .option("--generate [mode]", "service-generate a secret value (default mode: random)")
    .option("--length <bytes>", "random byte length for --generate random", "32")
    .option("--value-stdin", "read the secret value from stdin")
    .option("--allow-empty", "allow an intentionally empty secret value")
    .action(async function secretsSetAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        variableKey: string;
        generate?: string | true;
        length?: string;
        valueStdin?: boolean;
        allowEmpty?: boolean;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runSecretsSetCommand(flags, api, context, {
        variableKey: options.variableKey,
        generateMode: options.generate,
        generateLength: options.length,
        valueStdin: options.valueStdin === true,
        allowEmpty: options.allowEmpty === true,
      });
    });

  registerSecretsPromoteCommand(secrets, deps);
  registerSecretsRollbackCommand(secrets, deps);

  registerImportCommands(program, deps);
}

function collectRepeatedOption(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

function registerSecretsPromoteCommand(
  secrets: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runSecretsPromoteCommand>[1];
      context: Parameters<typeof runSecretsPromoteCommand>[2];
    }>;
  },
): void {
  secrets
    .command("promote")
    .description("Request protected promotion for exact draft versions (metadata only)")
    .requiredOption("--env-id <id>", "target environment opaque id")
    .option(
      "--draft-version-id <id>",
      "exact draft version id to promote (repeatable)",
      collectRepeatedOption,
      [] as string[],
    )
    .option("--comment <text>", "audit comment")
    .option("--impact-review-fingerprint <hash>", "resume fingerprint from prior review")
    .option("--operation-id <id>", "resume after High-Assurance Challenge clearance")
    .action(async function secretsPromoteAction(_args, command: CommanderCommand) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        envId: string;
        draftVersionId: string[];
        comment?: string;
        impactReviewFingerprint?: string;
        operationId?: string;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runSecretsPromoteCommand(flags, api, context, {
        envId: options.envId,
        draftVersionIds: options.draftVersionId,
        comment: options.comment,
        impactReviewFingerprint: options.impactReviewFingerprint,
        operationId: options.operationId,
      });
    });
}

function registerSecretsRollbackCommand(
  secrets: Command,
  deps: {
    readonly globalFlags: (command: CommanderCommand) => GlobalCliFlags;
    readonly resolveApi: (flags: GlobalCliFlags) => Promise<{
      api: Parameters<typeof runSecretsRollbackCommand>[1];
      context: Parameters<typeof runSecretsRollbackCommand>[2];
    }>;
  },
): void {
  secrets
    .command("rollback <secret-id>")
    .description("Rollback a secret from a retained published version (metadata only)")
    .requiredOption("--env-id <id>", "target environment opaque id")
    .requiredOption("--to-version <n>", "retained published version number")
    .option("--promote", "create draft and request promotion approval")
    .option("--comment <text>", "audit comment")
    .option("--operation-id <id>", "resume after High-Assurance Challenge clearance")
    .action(async function secretsRollbackAction(
      secretId: string,
      _args,
      command: CommanderCommand,
    ) {
      const flags = deps.globalFlags(command);
      const options = command.opts<{
        envId: string;
        toVersion: string;
        promote?: boolean;
        comment?: string;
        operationId?: string;
      }>();
      const { api, context } = await deps.resolveApi(flags);
      process.exitCode = await runSecretsRollbackCommand(flags, api, context, {
        secretId,
        envId: options.envId,
        toVersion: options.toVersion,
        promote: options.promote === true,
        comment: options.comment,
        operationId: options.operationId,
      });
    });
}
