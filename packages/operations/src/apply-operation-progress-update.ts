import type { OperationId, OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { mergeOperationProgress } from "./merge-operation-progress.js";
import { toOperationPollResult } from "./operation-row.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import { isTerminalOperationState } from "./operation-states.js";
import type { OperationPollResult, OperationProgressPatch } from "./operation-types.js";
import { validateOperationProgress } from "./validate-operation-metadata.js";
import { updateOperationProgressRow } from "./update-operation-progress-row.js";

export interface ApplyOperationProgressUpdateInput {
  organizationId: OrganizationId;
  operationId: OperationId;
  progressPatch: OperationProgressPatch;
  highAssuranceClearCas?: { challengeId: string };
  staleTransitionMessage: string;
  assertWritable?: (current: OperationPollResult) => void;
}

async function readWritableOperation(
  getById: (
    organizationId: OrganizationId,
    operationId: OperationId,
  ) => Promise<OperationPollResult | null>,
  organizationId: OrganizationId,
  operationId: OperationId,
): Promise<OperationPollResult> {
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

export async function applyOperationProgressUpdate(
  sql: TenantScopedSql,
  getById: (
    organizationId: OrganizationId,
    operationId: OperationId,
  ) => Promise<OperationPollResult | null>,
  input: ApplyOperationProgressUpdateInput,
): Promise<OperationPollResult> {
  const existing = await readWritableOperation(getById, input.organizationId, input.operationId);
  input.assertWritable?.(existing);

  const mergedProgress = mergeOperationProgress(existing.progress, input.progressPatch);
  validateOperationProgress(mergedProgress, input.organizationId);

  const row = await updateOperationProgressRow(sql, {
    organizationId: input.organizationId,
    operationId: input.operationId,
    mergedProgress,
    state: existing.state,
    ...(input.highAssuranceClearCas === undefined
      ? {}
      : { highAssuranceClearCas: input.highAssuranceClearCas }),
  });
  if (row === undefined) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.staleTransition,
      input.staleTransitionMessage,
      true,
    );
  }
  return toOperationPollResult(row);
}
