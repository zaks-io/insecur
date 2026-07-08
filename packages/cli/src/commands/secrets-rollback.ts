import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { parseEnvironmentId, parseSecretId } from "../config/parse-resource-id.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireProjectScope } from "./navigation-scope.js";
import { parseOperationIdOrThrow } from "./operations-scope.js";
import { handleApiFailure } from "./api-failure.js";
import { renderSuccess } from "../output/render.js";

export interface SecretsRollbackCommandOptions {
  readonly secretId: string;
  readonly envId: string;
  readonly toVersion: string;
  readonly promote: boolean;
  readonly comment: string | undefined;
  readonly operationId: string | undefined;
}

export async function runSecretsRollbackCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: SecretsRollbackCommandOptions,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const projectScope = requireProjectScope(context.scope);
  const environmentId = parseEnvironmentId(commandOptions.envId, "--env-id");
  const secretId = parseSecretId(commandOptions.secretId, "secret-id");
  const toVersion = Number.parseInt(commandOptions.toVersion, 10);
  if (!Number.isInteger(toVersion) || toVersion < 1) {
    throw new Error("--to-version must be a positive integer.");
  }
  const operationId =
    commandOptions.operationId === undefined
      ? undefined
      : parseOperationIdOrThrow(commandOptions.operationId);

  const result = await api.requestProtectedRollback({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: projectScope.orgId,
    projectId: projectScope.projectId,
    environmentId,
    secretId,
    toVersion,
    ...(commandOptions.promote ? { promote: true } : {}),
    ...(commandOptions.comment !== undefined ? { comment: commandOptions.comment } : {}),
    ...(operationId === undefined ? {} : { operationId }),
  });
  if (!result.ok) {
    return handleApiFailure(result.envelope, flags);
  }

  const data = result.envelope.data;
  renderSuccess(
    result.envelope,
    flags,
    () =>
      `Rolled back secret ${data.secretId} to version ${String(data.versionNumber)} (${data.lifecycleState}).`,
  );
  return 0;
}
