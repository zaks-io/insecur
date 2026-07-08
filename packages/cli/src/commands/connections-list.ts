import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireOrgScope } from "./navigation-scope.js";
import { handleApiFailure } from "./api-failure.js";
import { renderSuccess } from "../output/render.js";

export async function runConnectionsListCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const orgScope = requireOrgScope(context.scope);

  const result = await api.listAppConnections({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: orgScope.orgId,
  });
  if (!result.ok) {
    return handleApiFailure(result.envelope, flags);
  }

  renderSuccess(
    result.envelope,
    flags,
    () => `Listed ${String(result.envelope.data.connections.length)} connections.`,
  );
  return 0;
}
