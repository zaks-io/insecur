import {
  OPERATION_ERROR_CODES,
  assertMetadataOnlyValue,
  successEnvelope,
  type NextAction,
} from "@insecur/domain";
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

function waitRemediation(operationId: string, timeoutSeconds?: number): readonly string[] {
  return [
    "insecur",
    "operations",
    "wait",
    operationId,
    ...(timeoutSeconds === undefined ? [] : ["--timeout", String(timeoutSeconds)]),
    "--json",
  ];
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
  readonly remediation: { readonly poll: readonly string[] };
} {
  const error = {
    code: OPERATION_ERROR_CODES.waitTimeout,
    message: `Timed out after ${String(timeoutSeconds)} seconds waiting for operation ${operationIdValue} to reach a terminal state.`,
    retryable: true as const,
  };
  const envelope = {
    ok: false as const,
    error,
    data: operation,
    remediation: { poll: waitRemediation(operationIdValue, timeoutSeconds) },
  };
  assertMetadataOnlyValue(envelope);
  return envelope;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function readyResumeArgv(operation: OperationPollData): readonly string[] | undefined {
  const challenge = operation.progress.highAssuranceChallenge;
  if (
    challenge === null ||
    typeof challenge !== "object" ||
    typeof (challenge as Record<string, unknown>).clearedAt !== "string"
  ) {
    return undefined;
  }
  const argv = operation.progress.resumeArgv;
  return Array.isArray(argv) && argv.every((value) => typeof value === "string") ? argv : [];
}

function renderReadyToResume(
  operation: OperationPollData,
  flags: GlobalCliFlags,
  resumeArgv: readonly string[],
): void {
  const next: readonly NextAction[] =
    resumeArgv.length === 0
      ? []
      : [{ id: "resume", actor: "agent", kind: "execute", argv: resumeArgv }];
  renderSuccess(
    successEnvelope(
      { ...operation, readyToResume: true },
      { operationId: operation.operationId },
      next,
    ),
    flags,
    () => `Operation ${operation.operationId} is ready to resume.`,
  );
}

function renderCompletedWait(data: OperationPollData, flags: GlobalCliFlags): number | undefined {
  const resumeArgv = readyResumeArgv(data);
  if (resumeArgv !== undefined) {
    renderReadyToResume(data, flags, resumeArgv);
    return 0;
  }
  if (!isTerminalOperationPollState(data.state)) {
    return undefined;
  }
  renderSuccess(successEnvelope(data, buildEnvelopeMeta({})), flags, () =>
    formatOperationHuman(data),
  );
  return isSuccessTerminalOperationPollState(data.state) ? 0 : EXIT_WAIT_TIMEOUT;
}

function deadlineFromTimeout(timeoutSeconds: number | undefined): number | undefined {
  return timeoutSeconds === undefined ? undefined : Date.now() + timeoutSeconds * 1_000;
}

export async function runOperationsWaitCommand(
  flags: GlobalCliFlags,
  api: ApiClient,
  context: ResolvedCliContext,
  commandOptions: OperationsWaitCommandOptions,
): Promise<number> {
  const operationIdValue = parseOperationIdOrThrow(commandOptions.operationId);
  const deadlineMs = deadlineFromTimeout(commandOptions.timeoutSeconds);

  for (;;) {
    const data = await fetchOperationState(api, context, operationIdValue);
    const completed = renderCompletedWait(data, flags);
    if (completed !== undefined) {
      return completed;
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
