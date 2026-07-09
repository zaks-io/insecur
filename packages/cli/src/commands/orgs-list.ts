import { successEnvelope } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { assertHostedCapability } from "../local/cloud-feature-guard.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { emptyState } from "../output/format.js";
import { renderSuccess } from "../output/render.js";
import { renderTable } from "../output/table.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";

export async function runOrgsListCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
): Promise<number> {
  assertHostedCapability(context.scope, {
    capability: "Organization listing",
    hostedCommand: ["insecur", "orgs", "list"],
  });
  const credential = await requireSessionCredential(context.scope.host);
  const result = await api.listSessionOrganizations({
    host: context.scope.host,
    bearerCredential: credential,
  });
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }

  const output = successEnvelope(
    { organizations: result.envelope.data.organizations },
    buildEnvelopeMeta({ requestId: result.envelope.meta?.requestId }),
  );
  renderSuccess(output, flags, (data) => {
    if (data.organizations.length === 0) {
      return emptyState("You don't belong to any organizations yet.");
    }
    return renderTable(
      [
        {
          header: "Organization",
          get: (org) => ({ kind: "plain", text: org.displayName, untrusted: true }),
        },
        { header: "Org ID", get: (org) => ({ kind: "id", text: org.organizationId }) },
      ],
      data.organizations,
    );
  });
  return 0;
}
