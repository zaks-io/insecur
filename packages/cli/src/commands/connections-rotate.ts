import { CLI_ERROR_CODES } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { collectSecretValue } from "../input/collect-secret-value.js";
import { CliError } from "../output/cli-error.js";
import { parseOperationIdOrThrow } from "./operations-scope.js";
import {
  finishConnectionCommand,
  resolveOrgScopedConnectionTarget,
} from "./connections-command-scope.js";
import { rejectArgvProviderToken } from "./connections-cli-input.js";
import { connectionRotateResumeArgv } from "./resume-argv.js";

export interface ConnectionsRotateCommandOptions {
  readonly connectionId: string;
  readonly dryRun: boolean;
  readonly operationId: string | undefined;
  readonly valueStdin: boolean;
  readonly token: string | undefined;
}

function rejectArgvToken(token: string | undefined): void {
  rejectArgvProviderToken(token);
}

async function readRotationToken(
  options: ConnectionsRotateCommandOptions,
): Promise<Uint8Array | undefined> {
  if (options.dryRun) {
    return undefined;
  }
  const collected = await collectSecretValue({
    generateMode: undefined,
    generateLength: undefined,
    valueStdin: options.valueStdin,
    allowEmpty: false,
    inputRequiredUsage: ["insecur", "connections", "rotate", options.connectionId, "--value-stdin"],
  });
  if (collected.inputMode === "generated") {
    throw new CliError({
      code: CLI_ERROR_CODES.validationError,
      message: "Credential rotation does not support --generate.",
      retryable: false,
    });
  }
  return collected.valueUtf8;
}

export async function runConnectionsRotateCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  options: ConnectionsRotateCommandOptions,
): Promise<number> {
  rejectArgvToken(options.token);
  const target = await resolveOrgScopedConnectionTarget(
    context,
    options.connectionId,
    "connection id",
  );
  const operationId =
    options.operationId === undefined ? undefined : parseOperationIdOrThrow(options.operationId);

  const tokenUtf8 = await readRotationToken(options);

  const result = await api.rotateAppConnectionCredential({
    ...target,
    dryRun: options.dryRun,
    ...(operationId === undefined ? {} : { operationId }),
    ...(tokenUtf8 === undefined ? {} : { tokenUtf8 }),
  });
  return finishConnectionCommand(
    flags,
    result,
    () =>
      options.dryRun
        ? `Dry-run validation completed for ${target.appConnectionId}.`
        : `Rotated credentials for ${target.appConnectionId}.`,
    {
      resumeActor: options.dryRun ? "agent" : "human",
      resumeArgv: (nextOperationId) =>
        connectionRotateResumeArgv(options.connectionId, options.dryRun, nextOperationId),
    },
  );
}
