import type { OperationId, OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { mergeOperationProgress } from "./merge-operation-progress.js";
import { type OperationRecord, toOperationPollResult } from "./operation-row.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import { isTerminalOperationState } from "./operation-states.js";
import type { OperationPollResult, OperationProgressPatch } from "./operation-types.js";
import { validateOperationProgress } from "./validate-operation-metadata.js";
import { updateOperationProgressRow } from "./update-operation-progress-row.js";

/**
 * Progress patches are merge-patches, so a revision conflict is safe to re-read and re-merge.
 * Bounded so pathological contention still surfaces a retryable stale conflict.
 */
const MAX_PROGRESS_UPDATE_ATTEMPTS = 3;

export interface ApplyOperationProgressUpdateInput {
  organizationId: OrganizationId;
  operationId: OperationId;
  progressPatch: OperationProgressPatch;
  highAssuranceClearCas?: { challengeId: string };
  staleTransitionMessage: string;
  assertWritable?: (current: OperationPollResult) => void;
}

type GetOperationById = (
  organizationId: OrganizationId,
  operationId: OperationId,
) => Promise<OperationRecord | null>;

async function readWritableOperation(
  getById: GetOperationById,
  organizationId: OrganizationId,
  operationId: OperationId,
): Promise<OperationRecord> {
  const existing = await getById(organizationId, operationId);
  if (existing === null) {
    throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
  }
  if (isTerminalOperationState(existing.state)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.terminalState,
      `cannot update progress for terminal operation in state ${existing.state}`,
    );
  }
  return existing;
}

async function attemptOperationProgressUpdate(
  sql: TenantScopedSql,
  getById: GetOperationById,
  input: ApplyOperationProgressUpdateInput,
): Promise<OperationPollResult | undefined> {
  const existing = await readWritableOperation(getById, input.organizationId, input.operationId);
  input.assertWritable?.(existing);

  const mergedProgress = mergeOperationProgress(existing.progress, input.progressPatch);
  validateOperationProgress(mergedProgress, input.organizationId);

  const row = await updateOperationProgressRow(sql, {
    organizationId: input.organizationId,
    operationId: input.operationId,
    mergedProgress,
    state: existing.state,
    expectedRevision: existing.revision,
    ...(input.highAssuranceClearCas === undefined
      ? {}
      : { highAssuranceClearCas: input.highAssuranceClearCas }),
  });
  return row === undefined ? undefined : toOperationPollResult(row);
}

export async function applyOperationProgressUpdate(
  sql: TenantScopedSql,
  getById: GetOperationById,
  input: ApplyOperationProgressUpdateInput,
): Promise<OperationPollResult> {
  for (let attempt = 0; attempt < MAX_PROGRESS_UPDATE_ATTEMPTS; attempt += 1) {
    const updated = await attemptOperationProgressUpdate(sql, getById, input);
    if (updated !== undefined) {
      return updated;
    }
  }
  throw new OperationStoreError(
    OPERATION_ERROR_CODES.staleTransition,
    input.staleTransitionMessage,
    true,
  );
}
