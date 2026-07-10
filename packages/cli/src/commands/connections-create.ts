import { APP_CONNECTION_ERROR_CODES, CLI_ERROR_CODES } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { parseAppConnectionId } from "../config/parse-resource-id.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { collectSecretValue } from "../input/collect-secret-value.js";
import { readDisplayNameFromStdin } from "../input/read-display-name-stdin.js";
import { requireDisplayNameStdinFlag } from "../input/require-display-name-stdin.js";
import { CliError } from "../output/cli-error.js";
import { requireOrgScope } from "./navigation-scope.js";
import { parseOperationIdOrThrow } from "./operations-scope.js";
import { finishConnectionCommand } from "./connections-command-scope.js";
import {
  optionalGitHubBoundaryFields,
  parseCommaSeparatedRepositories,
  rejectArgvProviderToken,
} from "./connections-cli-input.js";
import { connectionCreateResumeArgv } from "./resume-argv.js";

export interface ConnectionsCreateCommandOptions {
  readonly provider: string;
  readonly connectionId: string;
  readonly method: string;
  readonly displayNameStdin: boolean;
  readonly operationId: string | undefined;
  readonly valueStdin: boolean;
  readonly token: string | undefined;
  readonly allowAccountId: string | undefined;
  readonly allowWorkerScript: string | undefined;
  readonly installationId: string | undefined;
  readonly owner: string | undefined;
  readonly allowedRepositories: string | undefined;
}

function assertCloudflareBoundaryFlags(options: ConnectionsCreateCommandOptions): void {
  if (options.provider !== "cloudflare") {
    return;
  }
  if (options.allowAccountId === undefined || options.allowWorkerScript === undefined) {
    throw new CliError({
      code: APP_CONNECTION_ERROR_CODES.boundaryMismatch,
      message:
        "Cloudflare connection create requires --allow-account-id and --allow-worker-script.",
      retryable: false,
    });
  }
}

async function readCloudflareCreateToken(
  options: ConnectionsCreateCommandOptions,
): Promise<Uint8Array | undefined> {
  if (options.provider !== "cloudflare" || options.method !== "scoped-api-token") {
    return undefined;
  }
  const collected = await collectSecretValue({
    generateMode: undefined,
    generateLength: undefined,
    valueStdin: options.valueStdin,
    allowEmpty: false,
    inputRequiredUsage: [
      "insecur",
      "connections",
      "create",
      options.provider,
      "--method",
      options.method,
      "--value-stdin",
    ],
  });
  if (collected.inputMode === "generated") {
    throw new CliError({
      code: CLI_ERROR_CODES.validationError,
      message: "Cloudflare connection create does not support --generate.",
      retryable: false,
    });
  }
  return collected.valueUtf8;
}

export async function runConnectionsCreateCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  options: ConnectionsCreateCommandOptions,
): Promise<number> {
  rejectArgvProviderToken(options.token);
  requireDisplayNameStdinFlag(options.displayNameStdin);
  assertCloudflareBoundaryFlags(options);

  const credential = await requireSessionCredential(context.scope.host);
  const orgScope = requireOrgScope(context.scope);
  const appConnectionId = parseAppConnectionId(options.connectionId, "--connection-id");
  const displayName = await readDisplayNameFromStdin("--display-name-stdin");
  const operationId =
    options.operationId === undefined ? undefined : parseOperationIdOrThrow(options.operationId);
  const tokenUtf8 = await readCloudflareCreateToken(options);
  const allowedRepositories =
    options.allowedRepositories === undefined
      ? undefined
      : parseCommaSeparatedRepositories(options.allowedRepositories);

  const result = await api.createAppConnection({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: orgScope.orgId,
    appConnectionId,
    provider: options.provider,
    connectionMethod: options.method,
    displayName,
    ...(operationId === undefined ? {} : { operationId }),
    ...(tokenUtf8 === undefined ? {} : { tokenUtf8 }),
    ...(options.allowAccountId === undefined ? {} : { allowAccountId: options.allowAccountId }),
    ...(options.allowWorkerScript === undefined
      ? {}
      : { allowWorkerScript: options.allowWorkerScript }),
    ...optionalGitHubBoundaryFields({
      installationId: options.installationId,
      owner: options.owner,
      allowedRepositories,
    }),
  });

  return finishConnectionCommand(
    flags,
    result,
    () => `Created app connection ${appConnectionId}.`,
    {
      resumeActor: "human",
      resumeArgv: (nextOperationId) => connectionCreateResumeArgv(options, nextOperationId),
    },
  );
}
