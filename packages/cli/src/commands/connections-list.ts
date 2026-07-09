import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireOrgScope } from "./navigation-scope.js";
import { handleApiFailure } from "./api-failure.js";
import { emptyState } from "../output/format.js";
import { renderSuccess } from "../output/render.js";
import { statusTone } from "../output/cell-format.js";
import { renderTable } from "../output/table.js";

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

  renderSuccess(result.envelope, flags, (data) => {
    if (data.connections.length === 0) {
      return emptyState(
        "No connections here yet. Add one with",
        "insecur connections create <provider> --method <method>",
      );
    }
    return renderTable(
      [
        {
          header: "Connection",
          get: (c) => ({ kind: "plain", text: c.displayName, untrusted: true }),
        },
        { header: "Provider", get: (c) => ({ kind: "plain", text: c.provider, untrusted: true }) },
        {
          header: "Method",
          get: (c) => ({ kind: "plain", text: c.connectionMethod, untrusted: true }),
        },
        {
          header: "Status",
          get: (c) => ({ kind: "status", text: c.status, tone: statusTone(c.status) }),
        },
        { header: "Cred", get: (c) => ({ kind: "bool", value: c.hasActiveCredential }) },
        { header: "Checked", get: (c) => ({ kind: "time", iso: c.lastValidationCheckedAt }) },
      ],
      data.connections,
    );
  });
  return 0;
}
