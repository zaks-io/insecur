import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { parseEnvironmentId, parseSecretVersionId } from "../config/parse-resource-id.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireProjectScope } from "./navigation-scope.js";
import { parseOperationIdOrThrow } from "./operations-scope.js";
import { handleApiFailure } from "./api-failure.js";
import { renderSuccess } from "../output/render.js";

export interface SecretsPromoteCommandOptions {
  readonly envId: string;
  readonly draftVersionIds: readonly string[];
  readonly comment: string | undefined;
  readonly impactReviewFingerprint: string | undefined;
  readonly operationId: string | undefined;
}

export async function runSecretsPromoteCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: SecretsPromoteCommandOptions,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const projectScope = requireProjectScope(context.scope);
  const environmentId = parseEnvironmentId(commandOptions.envId, "--env-id");
  const draftVersionIds = commandOptions.draftVersionIds.map((id) =>
    parseSecretVersionId(id, "--draft-version-id"),
  );
  const operationId =
    commandOptions.operationId === undefined
      ? undefined
      : parseOperationIdOrThrow(commandOptions.operationId);

  const result = await api.requestProtectedPromotion({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: projectScope.orgId,
    projectId: projectScope.projectId,
    environmentId,
    draftVersionIds,
    ...(commandOptions.comment !== undefined ? { comment: commandOptions.comment } : {}),
    ...(commandOptions.impactReviewFingerprint !== undefined
      ? { impactReviewFingerprint: commandOptions.impactReviewFingerprint }
      : {}),
    ...(operationId === undefined ? {} : { operationId }),
  });
  if (!result.ok) {
    return handleApiFailure(result.envelope, flags);
  }

  const data = result.envelope.data;
  renderSuccess(
    result.envelope,
    flags,
    () => `Created approval request ${data.approvalRequestId} for protected promotion.`,
  );
  return 0;
}
