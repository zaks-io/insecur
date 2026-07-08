import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { parseOperationIdOrThrow } from "./operations-scope.js";
import {
  finishConnectionCommand,
  resolveOrgScopedConnectionTarget,
} from "./connections-command-scope.js";
import {
  parseCommaSeparatedRepositories,
  optionalGitHubBoundaryFields,
} from "./connections-cli-input.js";

export interface ConnectionsReauthCommandOptions {
  readonly connectionId: string;
  readonly operationId: string | undefined;
  readonly installationId: string | undefined;
  readonly owner: string | undefined;
  readonly allowedRepositories: string | undefined;
}

export async function runConnectionsReauthCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  options: ConnectionsReauthCommandOptions,
): Promise<number> {
  const target = await resolveOrgScopedConnectionTarget(
    context,
    options.connectionId,
    "connection id",
  );
  const operationId =
    options.operationId === undefined ? undefined : parseOperationIdOrThrow(options.operationId);
  const allowedRepositories =
    options.allowedRepositories === undefined
      ? undefined
      : parseCommaSeparatedRepositories(options.allowedRepositories);

  const result = await api.reauthAppConnection({
    ...target,
    ...(operationId === undefined ? {} : { operationId }),
    ...optionalGitHubBoundaryFields({
      installationId: options.installationId,
      owner: options.owner,
      allowedRepositories,
    }),
  });

  return finishConnectionCommand(
    flags,
    result,
    () => `Reauthorized connection ${target.appConnectionId}.`,
  );
}
