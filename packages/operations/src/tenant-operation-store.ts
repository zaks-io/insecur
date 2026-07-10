import { operationId, type OperationId, type OrganizationId } from "@insecur/domain";
import { bindJsonb, type TenantScopedSql } from "@insecur/tenant-store";
import {
  insertOperation as persistOperationRow,
  insertOperationStart as persistOperationStart,
} from "./insert-operation-row.js";
import { mergeOperationProgress } from "./merge-operation-progress.js";
import { type OperationRecord, type OperationRow, toOperationRecord } from "./operation-row.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import {
  casApplyOperationTransition,
  type ApplyTransitionInput,
} from "./apply-operation-transition.js";
import { applyOperationProgressUpdate } from "./apply-operation-progress-update.js";
import type { OperationProgress, OperationProgressPatch } from "./operation-types.js";
import { resolveOperationLiveness } from "./resolve-operation-liveness.js";
import { validateOperationProgress } from "./validate-operation-metadata.js";

export type { ApplyTransitionInput } from "./apply-operation-transition.js";

export class TenantOperationStore {
  constructor(private readonly sql: TenantScopedSql) {}

  private async readById(
    organizationId: OrganizationId,
    operationIdValue: OperationId,
  ): Promise<OperationRecord | null> {
    const rows = await this.sql<OperationRow[]>`
      SELECT
        id,
        org_id,
        state,
        intent_code,
        idempotency_key,
        progress,
        execution_deadline,
        revision,
        created_at,
        updated_at
      FROM operations
      WHERE id = ${operationIdValue}
        AND org_id = ${organizationId}
      LIMIT 1
    `;
    const row = rows[0];
    return row === undefined ? null : toOperationRecord(row);
  }

  private async readByIdempotencyKey(
    organizationId: OrganizationId,
    idempotencyKey: string,
  ): Promise<OperationRecord | null> {
    const rows = await this.sql<OperationRow[]>`
      SELECT
        id,
        org_id,
        state,
        intent_code,
        idempotency_key,
        progress,
        execution_deadline,
        revision,
        created_at,
        updated_at
      FROM operations
      WHERE org_id = ${organizationId}
        AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `;
    const row = rows[0];
    return row === undefined ? null : toOperationRecord(row);
  }

  async findByIdempotencyKey(
    organizationId: OrganizationId,
    idempotencyKey: string,
  ): Promise<OperationRecord | null> {
    const operation = await this.readByIdempotencyKey(organizationId, idempotencyKey);
    if (operation === null) {
      return null;
    }
    return await resolveOperationLiveness(this.sql, operation);
  }

  async getById(
    organizationId: OrganizationId,
    operationIdValue: OperationId,
  ): Promise<OperationRecord | null> {
    const operation = await this.readById(organizationId, operationIdValue);
    if (operation === null) {
      return null;
    }
    return await resolveOperationLiveness(this.sql, operation);
  }

  insertOperation(input: {
    operationId: OperationId;
    organizationId: OrganizationId;
    intentCode: string;
    idempotencyKey?: string;
    progress: OperationProgress;
  }): Promise<OperationRecord> {
    return persistOperationRow(this.sql, input);
  }

  insertOperationStart(input: {
    operationId: OperationId;
    organizationId: OrganizationId;
    intentCode: string;
    idempotencyKey?: string;
    progress: OperationProgress;
  }): Promise<{ operation: OperationRecord; created: boolean }> {
    return persistOperationStart(this.sql, input);
  }

  /**
   * Read-once compare-and-set state transition: one getById, gate, then CAS UPDATE.
   */
  async applyTransition(input: ApplyTransitionInput): Promise<OperationRecord> {
    const current = await this.getById(input.organizationId, input.operationId);
    if (current === null) {
      throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
    }
    if (input.beforeTransition !== undefined) {
      await input.beforeTransition(current);
    }
    return await casApplyOperationTransition(this.sql, current, input);
  }

  async recordProgress(input: {
    organizationId: OrganizationId;
    operationId: OperationId;
    progressPatch: OperationProgressPatch;
  }): Promise<OperationRecord> {
    return await applyOperationProgressUpdate(
      this.sql,
      (organizationId, operationId) => this.getById(organizationId, operationId),
      {
        organizationId: input.organizationId,
        operationId: input.operationId,
        progressPatch: input.progressPatch,
        staleTransitionMessage: "progress update lost a concurrent state change",
      },
    );
  }

  async recordClearHighAssuranceProgress(input: {
    organizationId: OrganizationId;
    operationId: OperationId;
    challengeId: string;
    progressPatch: OperationProgressPatch;
  }): Promise<OperationRecord> {
    return await applyOperationProgressUpdate(
      this.sql,
      (organizationId, operationId) => this.getById(organizationId, operationId),
      {
        organizationId: input.organizationId,
        operationId: input.operationId,
        progressPatch: input.progressPatch,
        highAssuranceClearCas: { challengeId: input.challengeId },
        staleTransitionMessage: "high-assurance challenge clear lost a concurrent write",
        assertWritable: (current) => {
          if (current.state !== "waiting_for_human") {
            throw new OperationStoreError(
              OPERATION_ERROR_CODES.invalidTransition,
              `high-assurance challenge clear not allowed from state ${current.state}`,
            );
          }
        },
      },
    );
  }

  async listPendingHighAssuranceChallenges(
    organizationId: OrganizationId,
  ): Promise<OperationRecord[]> {
    const rows = await this.sql<OperationRow[]>`
      SELECT
        id,
        org_id,
        state,
        intent_code,
        idempotency_key,
        progress,
        execution_deadline,
        revision,
        created_at,
        updated_at
      FROM operations
      WHERE org_id = ${organizationId}
        AND state = 'waiting_for_human'
        AND (progress->'highAssuranceChallenge') IS NOT NULL
        AND (progress->'highAssuranceChallenge'->>'clearedAt') IS NULL
        AND (progress->'highAssuranceChallenge'->>'consumedAt') IS NULL
      ORDER BY created_at ASC
    `;

    const operations = rows.map((row) => toOperationRecord(row));
    return await Promise.all(
      operations.map((operation) => resolveOperationLiveness(this.sql, operation)),
    );
  }

  /**
   * Clears lease binding metadata after the lease row is released, including on terminal operations.
   */
  async clearSyncTargetLeaseBinding(input: {
    organizationId: OrganizationId;
    operationId: OperationId;
  }): Promise<void> {
    const existing = await this.readById(input.organizationId, input.operationId);
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
        progress = ${bindJsonb(this.sql, mergedProgress)},
        revision = revision + 1,
        updated_at = now()
      WHERE id = ${input.operationId}
        AND org_id = ${input.organizationId}
        AND state = ${existing.state}
        AND revision = ${existing.revision}
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

  /**
   * Atomic single-field clear; no revision CAS on purpose. The sole caller is the serialized
   * lease-claim path acting on the operation whose lease it just claimed, and for a lease-held
   * operation the deadline is authoritatively null (ADR-0073), so clearing cannot erase newer
   * state. Bumping the revision still forces any concurrent read-merge-write snapshot to conflict
   * instead of resurrecting the cleared deadline.
   */
  async clearExecutionDeadline(input: {
    organizationId: OrganizationId;
    operationId: OperationId;
  }): Promise<void> {
    await this.sql`
      UPDATE operations
      SET
        execution_deadline = NULL,
        revision = revision + 1,
        updated_at = now()
      WHERE id = ${input.operationId}
        AND org_id = ${input.organizationId}
    `;
  }
}

export function generateOperationId(): OperationId {
  return operationId.generate();
}
