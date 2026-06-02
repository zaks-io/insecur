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
  isTerminalOperationState,
  isTransitionAllowed,
  type OperationState,
} from "./operation-states.js";
import type { OperationPollResult, OperationProgress } from "./operation-types.js";
import { validateOperationProgress } from "./validate-operation-metadata.js";

function progressToJson(progress: OperationProgress) {
  return JSON.parse(JSON.stringify(progress)) as Parameters<TenantScopedSql["json"]>[0];
}

function assertTransitionPreconditions(
  existing: OperationPollResult,
  input: {
    expectedState: OperationState;
    nextState: OperationState;
  },
): void {
  if (existing.state !== input.expectedState) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.staleTransition,
      `expected state ${input.expectedState}, found ${existing.state}`,
      true,
    );
  }
  if (isTerminalOperationState(existing.state)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.terminalState,
      `operation is terminal in state ${existing.state}`,
    );
  }
  if (!isTransitionAllowed(existing.state, input.nextState)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidTransition,
      `operation transition not allowed: ${existing.state} -> ${input.nextState}`,
    );
  }
}

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

  async compareAndSetTransition(input: {
    organizationId: OrganizationId;
    operationId: OperationId;
    expectedState: OperationState;
    nextState: OperationState;
    progressPatch: OperationProgress;
  }): Promise<OperationPollResult> {
    const existing = await this.getById(input.organizationId, input.operationId);
    if (existing === null) {
      throw new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found");
    }
    assertTransitionPreconditions(existing, input);

    const mergedProgress = mergeOperationProgress(existing.progress, input.progressPatch);
    validateOperationProgress(mergedProgress);

    const rows = await this.sql<OperationRow[]>`
      UPDATE operations
      SET
        state = ${input.nextState},
        progress = ${this.sql.json(progressToJson(mergedProgress))},
        updated_at = now()
      WHERE id = ${input.operationId}
        AND org_id = ${input.organizationId}
        AND state = ${input.expectedState}
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

  async recordProgress(input: {
    organizationId: OrganizationId;
    operationId: OperationId;
    progressPatch: OperationProgress;
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
    validateOperationProgress(mergedProgress);

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
}

export function generateOperationId(): OperationId {
  return operationId.generate();
}
