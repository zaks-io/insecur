import { successEnvelope } from "@insecur/domain";
import type { ApiClient } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { formatOperationHuman } from "./operations-get.js";
import { parseOperationIdOrThrow, requireOrganizationScope } from "./operations-scope.js";

export async function runOperationsCancelCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  rawOperationId: string,
): Promise<number> {
  const operationIdValue = parseOperationIdOrThrow(rawOperationId);
  const credential = await requireSessionCredential(context.scope.host);
  const organizationId = requireOrganizationScope(context.scope);
  const result = await api.cancelOperation({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId,
    operationId: operationIdValue,
  });
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }

  const data = result.envelope.data;
  const output = successEnvelope(data, buildEnvelopeMeta({}));
  renderSuccess(output, flags, () => formatOperationHuman(data));
  return 0;
}
