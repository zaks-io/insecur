import type { OperationId, OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { mergeOperationProgress } from "./merge-operation-progress.js";
import { type OperationRecord, toOperationPollResult } from "./operation-row.js";
import { computeNonLeaseExecutionDeadline } from "./operation-execution-deadline.js";
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
import type { OperationPollResult, OperationProgressPatch } from "./operation-types.js";
import { findActiveLeaseForOperation } from "./resolve-operation-liveness.js";
import { validateOperationProgress } from "./validate-operation-metadata.js";
import { updateOperationTransitionRow } from "./update-operation-transition-row.js";

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
  /** When set, overrides automatic execution-claim deadline handling for this transition. */
  executionDeadline?: string | null;
  /**
   * When set, CAS UPDATE also requires unconsumed, cleared high-assurance challenge
   * evidence with the given challenge id (ADR-0032 exact-once consume).
   */
  highAssuranceConsumeCas?: {
    challengeId: string;
  };
  /**
   * When set, CAS UPDATE also requires uncleared, unconsumed high-assurance challenge
   * evidence with the given challenge id (prevents deny-after-clear races).
   */
  highAssuranceDenyCas?: {
    challengeId: string;
  };
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

function assertIdempotentMutationKeyMatch(
  current: OperationPollResult,
  idempotency: NonNullable<ApplyTransitionInput["idempotency"]>,
): void {
  const storedKey = current.progress.mutationIdempotencyKey;
  if (storedKey !== undefined && storedKey !== idempotency.key) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.idempotencyMismatch,
      "mutation idempotency key reused with a different request key",
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

async function resolveExecutionDeadlineForTransition(
  sql: TenantScopedSql,
  current: OperationPollResult,
  input: ApplyTransitionInput,
): Promise<string | null> {
  if (input.executionDeadline !== undefined) {
    return input.executionDeadline;
  }

  if (input.nextState === "running") {
    const activeLease = await findActiveLeaseForOperation(
      sql,
      input.organizationId,
      input.operationId,
    );
    if (activeLease !== null || current.progress.syncTargetLease !== undefined) {
      return null;
    }
    return computeNonLeaseExecutionDeadline();
  }

  if (current.state === "running") {
    return null;
  }

  return current.executionDeadline ?? null;
}

export async function casApplyOperationTransition(
  sql: TenantScopedSql,
  current: OperationRecord,
  input: ApplyTransitionInput,
): Promise<OperationRecord> {
  if (input.idempotency !== undefined) {
    assertIdempotentMutationKeyMatch(current, input.idempotency);
    if (isIdempotentTransitionReplay(current, input.idempotency)) {
      return current;
    }
  }

  assertApplyTransitionAllowed(current, input);

  const mergedProgress = mergeOperationProgress(current.progress, input.progressPatch);
  validateOperationProgress(mergedProgress, input.organizationId);

  const executionDeadline = await resolveExecutionDeadlineForTransition(sql, current, input);

  const row = await updateOperationTransitionRow(sql, {
    current,
    transition: input,
    mergedProgress,
    executionDeadline,
  });
  if (row === undefined) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.staleTransition,
      "compare-and-set transition lost a concurrent write",
      true,
    );
  }
  return toOperationPollResult(row);
}
