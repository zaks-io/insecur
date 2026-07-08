import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { parseEnvironmentId } from "../config/parse-resource-id.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireProjectScope } from "./navigation-scope.js";
import { handleApiFailure } from "./api-failure.js";
import { renderSuccess } from "../output/render.js";

export interface ApprovalsListCommandOptions {
  readonly envId: string;
}

export async function runApprovalsListCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: ApprovalsListCommandOptions,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const projectScope = requireProjectScope(context.scope);
  const environmentId = parseEnvironmentId(commandOptions.envId, "--env-id");

  const result = await api.listEnvironmentApprovals({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: projectScope.orgId,
    projectId: projectScope.projectId,
    environmentId,
  });
  if (!result.ok) {
    return handleApiFailure(result.envelope, flags);
  }

  renderSuccess(result.envelope, flags, () => "Listed environment approval requests.");
  return 0;
}
