import type { OperationId, OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { mergeOperationProgress } from "./merge-operation-progress.js";
import { type OperationRow, toOperationPollResult } from "./operation-row.js";
import {
  OPERATION_ERROR_CODES,
  OperationStoreError,
  type OperationErrorCode,
} from "./operation-errors.js";
import {
  isTerminalOperationState,
  isTransitionAllowed,
  type OperationState,
} from "./operation-states.js";
import type {
  OperationPollResult,
  OperationProgress,
  OperationProgressPatch,
} from "./operation-types.js";
import { validateOperationProgress } from "./validate-operation-metadata.js";

function progressToJson(progress: OperationProgress) {
  return JSON.parse(JSON.stringify(progress)) as Parameters<TenantScopedSql["json"]>[0];
}

export interface ApplyTransitionInput {
  organizationId: OrganizationId;
  operationId: OperationId;
  nextState: OperationState;
  progressPatch: OperationProgressPatch;
  legalFromStates: ReadonlySet<OperationState> | "by-transition-table";
  notAllowedError: {
    code: OperationErrorCode;
    message: (state: OperationState) => string;
  };
  idempotency?: {
    key: string;
    alreadyAppliedWhen: (current: OperationPollResult) => boolean;
  };
  /** Runs after the single operation read and before transition gates or CAS. */
  beforeTransition?: (current: OperationPollResult) => Promise<void>;
}

function assertApplyTransitionAllowed(
  current: OperationPollResult,
  input: ApplyTransitionInput,
): void {
  if (
    input.legalFromStates !== "by-transition-table" &&
    !input.legalFromStates.has(current.state)
  ) {
    throw new OperationStoreError(
      input.notAllowedError.code,
      input.notAllowedError.message(current.state),
    );
  }
  if (isTerminalOperationState(current.state)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.terminalState,
      `operation is terminal in state ${current.state}`,
    );
  }
  if (!isTransitionAllowed(current.state, input.nextState)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidTransition,
      `operation transition not allowed: ${current.state} -> ${input.nextState}`,
    );
  }
}

function isIdempotentTransitionReplay(
  current: OperationPollResult,
  idempotency: NonNullable<ApplyTransitionInput["idempotency"]>,
): boolean {
  return (
    current.progress.mutationIdempotencyKey === idempotency.key &&
    idempotency.alreadyAppliedWhen(current)
  );
}

export async function casApplyOperationTransition(
  sql: TenantScopedSql,
  current: OperationPollResult,
  input: ApplyTransitionInput,
): Promise<OperationPollResult> {
  if (input.idempotency !== undefined && isIdempotentTransitionReplay(current, input.idempotency)) {
    return current;
  }

  assertApplyTransitionAllowed(current, input);

  const mergedProgress = mergeOperationProgress(current.progress, input.progressPatch);
  validateOperationProgress(mergedProgress, input.organizationId);

  const rows = await sql<OperationRow[]>`
    UPDATE operations
    SET
      state = ${input.nextState},
      progress = ${sql.json(progressToJson(mergedProgress))},
      updated_at = now()
    WHERE id = ${input.operationId}
      AND org_id = ${input.organizationId}
      AND state = ${current.state}
    RETURNING
      id,
      org_id,
      state,
      intent_code,
      idempotency_key,
      progress,
      created_at,
      updated_at
  `;
  const row = rows[0];
  if (row === undefined) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.staleTransition,
      "compare-and-set transition lost a concurrent write",
      true,
    );
  }
  return toOperationPollResult(row);
}
