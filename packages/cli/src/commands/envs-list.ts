import { successEnvelope } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireProjectScope } from "./navigation-scope.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { emptyState } from "../output/format.js";
import { renderSuccess } from "../output/render.js";
import { renderTable } from "../output/table.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";

export async function runEnvsListCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const projectScope = requireProjectScope(context.scope);
  const result = await api.listEnvironments({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: projectScope.orgId,
    projectId: projectScope.projectId,
  });
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }

  const output = successEnvelope(
    { environments: result.envelope.data.environments },
    buildEnvelopeMeta({ requestId: result.envelope.meta?.requestId }),
  );
  renderSuccess(output, flags, (data) => {
    if (data.environments.length === 0) {
      return emptyState("No environments here yet. Create one with", "insecur envs create");
    }
    return renderTable(
      [
        {
          header: "Environment",
          get: (env) => ({ kind: "plain", text: env.displayName, untrusted: true }),
        },
        {
          header: "Stage",
          get: (env) => ({ kind: "status", text: env.lifecycleStage, tone: "muted" }),
        },
        { header: "Protected", get: (env) => ({ kind: "bool", value: env.isProtected }) },
        { header: "Env ID", get: (env) => ({ kind: "id", text: env.environmentId }) },
        { header: "Created", get: (env) => ({ kind: "time", iso: env.createdAt }) },
      ],
      data.environments,
    );
  });
  return 0;
}
