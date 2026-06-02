import { operationId, type OperationId, type OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import {
  insertOperation as persistOperationRow,
  insertOperationStart as persistOperationStart,
} from "./insert-operation-row.js";
import { mergeOperationProgress } from "./merge-operation-progress.js";
import { type OperationRow, toOperationPollResult } from "./operation-row.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import {
  casApplyOperationTransition,
  type ApplyTransitionInput,
} from "./apply-operation-transition.js";
import { isTerminalOperationState } from "./operation-states.js";
import type {
  OperationPollResult,
  OperationProgress,
  OperationProgressPatch,
} from "./operation-types.js";
import { validateOperationProgress } from "./validate-operation-metadata.js";

function progressToJson(progress: OperationProgress) {
  return JSON.parse(JSON.stringify(progress)) as Parameters<TenantScopedSql["json"]>[0];
}

export type { ApplyTransitionInput } from "./apply-operation-transition.js";

export class TenantOperationStore {
  constructor(private readonly sql: TenantScopedSql) {}

  async findByIdempotencyKey(
    organizationId: OrganizationId,
    idempotencyKey: string,
  ): Promise<OperationPollResult | null> {
    const rows = await this.sql<OperationRow[]>`
      SELECT
        id,
        org_id,
        state,
        intent_code,
        idempotency_key,
        progress,
        created_at,
        updated_at
      FROM operations
      WHERE org_id = ${organizationId}
        AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `;
    const row = rows[0];
    return row === undefined ? null : toOperationPollResult(row);
  }

  async getById(
    organizationId: OrganizationId,
    operationIdValue: OperationId,
  ): Promise<OperationPollResult | null> {
    const rows = await this.sql<OperationRow[]>`
      SELECT
        id,
        org_id,
        state,
        intent_code,
        idempotency_key,
        progress,
        created_at,
        updated_at
      FROM operations
      WHERE id = ${operationIdValue}
        AND org_id = ${organizationId}
      LIMIT 1
    `;
    const row = rows[0];
    return row === undefined ? null : toOperationPollResult(row);
  }

  insertOperation(input: {
    operationId: OperationId;
    organizationId: OrganizationId;
    intentCode: string;
    idempotencyKey?: string;
    progress: OperationProgress;
  }): Promise<OperationPollResult> {
    return persistOperationRow(this.sql, input);
  }

  insertOperationStart(input: {
    operationId: OperationId;
    organizationId: OrganizationId;
    intentCode: string;
    idempotencyKey?: string;
    progress: OperationProgress;
  }): Promise<{ operation: OperationPollResult; created: boolean }> {
    return persistOperationStart(this.sql, input);
  }

  /**
   * Read-once compare-and-set state transition: one getById, gate, then CAS UPDATE.
   */
  async applyTransition(input: ApplyTransitionInput): Promise<OperationPollResult> {
    const current = await this.getById(input.organizationId, input.operationId);
    if (current === null) {
      throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
    }
    return await casApplyOperationTransition(this.sql, current, input);
  }

  async recordProgress(input: {
    organizationId: OrganizationId;
    operationId: OperationId;
    progressPatch: OperationProgressPatch;
  }): Promise<OperationPollResult> {
    const existing = await this.getById(input.organizationId, input.operationId);
    if (existing === null) {
      throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
    }
    if (isTerminalOperationState(existing.state)) {
      throw new OperationStoreError(
        OPERATION_ERROR_CODES.terminalState,
        `cannot update progress for terminal operation in state ${existing.state}`,
      );
    }

    const mergedProgress = mergeOperationProgress(existing.progress, input.progressPatch);
    validateOperationProgress(mergedProgress, input.organizationId);

    const rows = await this.sql<OperationRow[]>`
      UPDATE operations
      SET
        progress = ${this.sql.json(progressToJson(mergedProgress))},
        updated_at = now()
      WHERE id = ${input.operationId}
        AND org_id = ${input.organizationId}
        AND state = ${existing.state}
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
        "progress update lost a concurrent state change",
        true,
      );
    }
    return toOperationPollResult(row);
  }

  /**
   * Clears lease binding metadata after the lease row is released, including on terminal operations.
   */
  async clearSyncTargetLeaseBinding(input: {
    organizationId: OrganizationId;
    operationId: OperationId;
  }): Promise<void> {
    const existing = await this.getById(input.organizationId, input.operationId);
    if (existing === null) {
      throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
    }
    if (existing.progress.syncTargetLease === undefined) {
      return;
    }

    const mergedProgress = mergeOperationProgress(existing.progress, { syncTargetLease: null });
    validateOperationProgress(mergedProgress, input.organizationId);

    const rows = await this.sql<OperationRow[]>`
      UPDATE operations
      SET
        progress = ${this.sql.json(progressToJson(mergedProgress))},
        updated_at = now()
      WHERE id = ${input.operationId}
        AND org_id = ${input.organizationId}
        AND state = ${existing.state}
      RETURNING id
    `;
    if (rows[0] === undefined) {
      throw new OperationStoreError(
        OPERATION_ERROR_CODES.staleTransition,
        "sync target lease binding clear lost a concurrent state change",
        true,
      );
    }
  }
}

export function generateOperationId(): OperationId {
  return operationId.generate();
}
