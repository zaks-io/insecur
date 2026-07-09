import { successEnvelope } from "@insecur/domain";
import type { ApiClient, OperationPollData } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { requireSessionCredential } from "../auth/require-session.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { absoluteLocal, relativeTime } from "../output/cell-format.js";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import { emptyValue, renderDetail } from "../output/detail.js";
import { statusText } from "../output/format.js";
import { renderSuccess } from "../output/render.js";
import { getStyle } from "../output/style.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import { parseOperationIdOrThrow, requireOrganizationScope } from "./operations-scope.js";

export function formatOperationHuman(data: OperationPollData): string {
  const s = getStyle();
  const deadline =
    data.executionDeadline === undefined
      ? emptyValue()
      : `${relativeTime(data.executionDeadline)} (${absoluteLocal(data.executionDeadline)})`;
  return renderDetail([
    { label: "Operation", value: s.id(data.operationId) },
    { label: "State", value: statusText(data.state) },
    { label: "Intent", value: data.intentCode },
    { label: "Created", value: relativeTime(data.createdAt) },
    { label: "Updated", value: relativeTime(data.updatedAt) },
    { label: "Deadline", value: deadline },
  ]);
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
    throw cliErrorFromEnvelope(result.envelope);
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

const TERMINAL_OPERATION_POLL_STATES = new Set([
  "succeeded",
  "completed_with_warnings",
  "canceled",
  "failed",
  "incomplete",
]);

export function isTerminalOperationPollState(state: string): boolean {
  return TERMINAL_OPERATION_POLL_STATES.has(state);
}

export function isSuccessTerminalOperationPollState(state: string): boolean {
  return state !== "incomplete" && TERMINAL_OPERATION_POLL_STATES.has(state);
}
