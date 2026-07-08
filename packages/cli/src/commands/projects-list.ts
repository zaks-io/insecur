import { successEnvelope } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireOrgScope } from "./navigation-scope.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";

export async function runProjectsListCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const orgScope = requireOrgScope(context.scope);
  const result = await api.listProjects({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: orgScope.orgId,
  });
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }

  const output = successEnvelope(
    { projects: result.envelope.data.projects },
    buildEnvelopeMeta({ requestId: result.envelope.meta?.requestId }),
  );
  renderSuccess(
    output,
    flags,
    () => `Listed ${String(result.envelope.data.projects.length)} project(s).`,
  );
  return 0;
}
