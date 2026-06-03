import type { OperationId, OrganizationId } from "@insecur/domain";
import { isUniqueConstraintViolation, type TenantScopedSql } from "@insecur/tenant-store";
import { type OperationRow, toOperationPollResult } from "./operation-row.js";
import type { OperationPollResult, OperationProgress } from "./operation-types.js";
import { validateOperationProgress } from "./validate-operation-metadata.js";

function progressToJson(progress: OperationProgress) {
  return JSON.parse(JSON.stringify(progress)) as Parameters<TenantScopedSql["json"]>[0];
}

async function selectByIdempotencyKey(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  idempotencyKey: string,
): Promise<OperationPollResult | null> {
  const rows = await sql<OperationRow[]>`
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

async function insertOperationRow(
  sql: TenantScopedSql,
  input: {
    operationId: OperationId;
    organizationId: OrganizationId;
    intentCode: string;
    idempotencyKey?: string;
    progress: OperationProgress;
  },
): Promise<OperationRow> {
  const rows = await sql<OperationRow[]>`
    INSERT INTO operations (
      id,
      org_id,
      state,
      intent_code,
      idempotency_key,
      progress
    )
    VALUES (
      ${input.operationId},
      ${input.organizationId},
      ${"pending"},
      ${input.intentCode},
      ${input.idempotencyKey ?? null},
      ${sql.json(progressToJson(input.progress))}
    )
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
    throw new Error("insert operation returned no row");
  }
  return row;
}

async function upsertOperationByIdempotencyKey(
  sql: TenantScopedSql,
  input: {
    operationId: OperationId;
    organizationId: OrganizationId;
    intentCode: string;
    idempotencyKey: string;
    progress: OperationProgress;
  },
): Promise<{ operation: OperationPollResult; created: boolean }> {
  const rows = await sql<OperationRow[]>`
    INSERT INTO operations (
      id,
      org_id,
      state,
      intent_code,
      idempotency_key,
      progress
    )
    VALUES (
      ${input.operationId},
      ${input.organizationId},
      ${"pending"},
      ${input.intentCode},
      ${input.idempotencyKey},
      ${sql.json(progressToJson(input.progress))}
    )
    ON CONFLICT (org_id, idempotency_key) WHERE idempotency_key IS NOT NULL
    DO UPDATE SET updated_at = operations.updated_at
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
    throw new Error("insert operation idempotent upsert returned no row");
  }
  return {
    operation: toOperationPollResult(row),
    created: row.id === input.operationId,
  };
}

async function insertWithIdempotencyKey(
  sql: TenantScopedSql,
  input: {
    operationId: OperationId;
    organizationId: OrganizationId;
    intentCode: string;
    idempotencyKey: string;
    progress: OperationProgress;
  },
): Promise<{ operation: OperationPollResult; created: boolean }> {
  try {
    return await upsertOperationByIdempotencyKey(sql, input);
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }
    const existing = await selectByIdempotencyKey(sql, input.organizationId, input.idempotencyKey);
    if (existing === null) {
      throw error;
    }
    return { operation: existing, created: false };
  }
}

/**
 * Atomically creates an operation or returns the existing row for the same idempotency key.
 */
export async function insertOperationStart(
  sql: TenantScopedSql,
  input: {
    operationId: OperationId;
    organizationId: OrganizationId;
    intentCode: string;
    idempotencyKey?: string;
    progress: OperationProgress;
  },
): Promise<{ operation: OperationPollResult; created: boolean }> {
  validateOperationProgress(input.progress);

  if (input.idempotencyKey === undefined) {
    const row = await insertOperationRow(sql, input);
    return { operation: toOperationPollResult(row), created: true };
  }

  return await insertWithIdempotencyKey(sql, {
    ...input,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function insertOperation(
  sql: TenantScopedSql,
  input: {
    operationId: OperationId;
    organizationId: OrganizationId;
    intentCode: string;
    idempotencyKey?: string;
    progress: OperationProgress;
  },
): Promise<OperationPollResult> {
  const { operation } = await insertOperationStart(sql, input);
  return operation;
}
