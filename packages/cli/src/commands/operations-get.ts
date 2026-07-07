import { successEnvelope } from "@insecur/domain";
import type { ApiClient, OperationPollData } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { CliError } from "../output/cli-error.js";
import { renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { parseOperationIdOrThrow, requireOrganizationScope } from "./operations-scope.js";

export function formatOperationHuman(data: OperationPollData): string {
  return `Operation ${data.operationId} is ${data.state} (${data.intentCode}).`;
}

export async function fetchOperationState(
  api: ApiClient,
  context: ResolvedCliContext,
  operationIdValue: ReturnType<typeof parseOperationIdOrThrow>,
): Promise<OperationPollData> {
  const credential = await requireSessionCredential(context.scope.host);
  const organizationId = requireOrganizationScope(context.scope);
  const result = await api.getOperation({
    host: context.scope.host,
    bearerCredential: credential,
    organizationId,
    operationId: operationIdValue,
  });
  if (!result.ok) {
    throw new CliError(result.envelope.error);
  }
  return result.envelope.data;
}

export async function runOperationsGetCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  rawOperationId: string,
): Promise<number> {
  const operationIdValue = parseOperationIdOrThrow(rawOperationId);
  const data = await fetchOperationState(api, context, operationIdValue);
  const output = successEnvelope(data, buildEnvelopeMeta({}));
  renderSuccess(output, flags, () => formatOperationHuman(data));
  return 0;
}

const TERMINAL_OPERATION_STATES = new Set([
  "succeeded",
  "completed_with_warnings",
  "canceled",
  "failed",
]);

export function isTerminalOperationPollState(state: string): boolean {
  return TERMINAL_OPERATION_STATES.has(state);
}
