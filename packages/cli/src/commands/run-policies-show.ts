import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import { parseRuntimePolicyId } from "../config/parse-resource-id.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { requireOrgScope } from "./navigation-scope.js";
import { handleApiFailure } from "./api-failure.js";
import { renderSuccess } from "../output/render.js";

export async function runRunPoliciesShowCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  rawPolicyId: string,
): Promise<number> {
  const credential = await requireSessionCredential(context.scope.host);
  const orgScope = requireOrgScope(context.scope);
  const policyId = parseRuntimePolicyId(rawPolicyId);

  const result = await api.getRuntimeInjectionPolicy({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId: orgScope.orgId,
    policyId,
  });
  if (!result.ok) {
    return handleApiFailure(result.envelope, flags);
  }

  renderSuccess(result.envelope, flags, (data) => `Policy ${data.policyId} (${data.displayName}).`);
  return 0;
}
