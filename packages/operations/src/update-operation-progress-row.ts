import { bindJsonb, type TenantScopedSql } from "@insecur/tenant-store";
import { type OperationRow } from "./operation-row.js";
import type { OperationPollResult } from "./operation-types.js";

interface ProgressRowUpdateInput {
  organizationId: OperationPollResult["organizationId"];
  operationId: OperationPollResult["operationId"];
  mergedProgress: OperationPollResult["progress"];
  state: OperationPollResult["state"];
}

async function updateStandardOperationProgressRow(
  sql: TenantScopedSql,
  input: ProgressRowUpdateInput,
): Promise<OperationRow | undefined> {
  const rows = await sql<OperationRow[]>`
    UPDATE operations
    SET
      progress = ${bindJsonb(sql, input.mergedProgress)},
      updated_at = now()
    WHERE id = ${input.operationId}
      AND org_id = ${input.organizationId}
      AND state = ${input.state}
    RETURNING
      id,
      org_id,
      state,
      intent_code,
      idempotency_key,
      progress,
      execution_deadline,
      created_at,
      updated_at
  `;
  return rows[0];
}

async function updateHighAssuranceClearOperationProgressRow(
  sql: TenantScopedSql,
  input: ProgressRowUpdateInput,
  highAssuranceClearCas: { challengeId: string },
): Promise<OperationRow | undefined> {
  const rows = await sql<OperationRow[]>`
    UPDATE operations
    SET
      progress = ${bindJsonb(sql, input.mergedProgress)},
      updated_at = now()
    WHERE id = ${input.operationId}
      AND org_id = ${input.organizationId}
      AND state = ${input.state}
      AND state = 'waiting_for_human'
      AND (progress->'highAssuranceChallenge'->>'clearedAt') IS NULL
      AND (progress->'highAssuranceChallenge'->>'challengeId') = ${highAssuranceClearCas.challengeId}
    RETURNING
      id,
      org_id,
      state,
      intent_code,
      idempotency_key,
      progress,
      execution_deadline,
      created_at,
      updated_at
  `;
  return rows[0];
}

export async function updateOperationProgressRow(
  sql: TenantScopedSql,
  input: ProgressRowUpdateInput & {
    highAssuranceClearCas?: { challengeId: string };
  },
): Promise<OperationRow | undefined> {
  if (input.highAssuranceClearCas === undefined) {
    return await updateStandardOperationProgressRow(sql, input);
  }

  return await updateHighAssuranceClearOperationProgressRow(
    sql,
    input,
    input.highAssuranceClearCas,
  );
}
