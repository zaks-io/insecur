import { OPERATION_ERROR_CODES, assertMetadataOnlyValue, successEnvelope } from "@insecur/domain";
import type { ApiClient, OperationPollData } from "../api/types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import { EXIT_WAIT_TIMEOUT } from "../output/exit-codes.js";
import { renderEnvelope, renderSuccess } from "../output/render.js";
import { buildEnvelopeMeta } from "../output/target-echo.js";
import {
  fetchOperationState,
  formatOperationHuman,
  isSuccessTerminalOperationPollState,
  isTerminalOperationPollState,
} from "./operations-get.js";
import { parseOperationIdOrThrow } from "./operations-scope.js";

const DEFAULT_POLL_INTERVAL_MS = 1_000;

export interface OperationsWaitCommandOptions {
  readonly operationId: string;
  readonly timeoutSeconds?: number;
}

function waitRemediation(operationId: string, timeoutSeconds?: number): string {
  const timeoutFlag = timeoutSeconds === undefined ? "" : ` --timeout ${String(timeoutSeconds)}`;
  return `Re-run: insecur operations wait ${operationId}${timeoutFlag} --json`;
}

function operationWaitTimeoutEnvelope(
  operation: OperationPollData,
  timeoutSeconds: number,
  operationIdValue: string,
): {
  readonly ok: false;
  readonly error: {
    readonly code: typeof OPERATION_ERROR_CODES.waitTimeout;
    readonly message: string;
    readonly retryable: true;
  };
  readonly data: OperationPollData;
} {
  const error = {
    code: OPERATION_ERROR_CODES.waitTimeout,
    message: `Timed out after ${String(timeoutSeconds)} seconds waiting for operation ${operationIdValue} to reach a terminal state. ${waitRemediation(operationIdValue, timeoutSeconds)}`,
    retryable: true as const,
  };
  const envelope = {
    ok: false as const,
    error,
    data: operation,
  };
  assertMetadataOnlyValue(envelope);
  return envelope;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function runOperationsWaitCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: OperationsWaitCommandOptions,
): Promise<number> {
  const operationIdValue = parseOperationIdOrThrow(commandOptions.operationId);
  const deadlineMs =
    commandOptions.timeoutSeconds === undefined
      ? undefined
      : Date.now() + commandOptions.timeoutSeconds * 1_000;

  for (;;) {
    const data = await fetchOperationState(api, context, operationIdValue);
    if (isTerminalOperationPollState(data.state)) {
      const output = successEnvelope(data, buildEnvelopeMeta({}));
      renderSuccess(output, flags, () => formatOperationHuman(data));
      return isSuccessTerminalOperationPollState(data.state) ? 0 : EXIT_WAIT_TIMEOUT;
    }

    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      const envelope = operationWaitTimeoutEnvelope(
        data,
        commandOptions.timeoutSeconds ?? 0,
        commandOptions.operationId,
      );
      renderEnvelope(envelope, flags, () => envelope.error.message);
      return EXIT_WAIT_TIMEOUT;
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }
}
