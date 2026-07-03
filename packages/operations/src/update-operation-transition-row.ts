import { bindJsonb, type TenantScopedSql } from "@insecur/tenant-store";
import type { ApplyTransitionInput } from "./apply-operation-transition.js";
import { type OperationRow } from "./operation-row.js";
import type { OperationPollResult } from "./operation-types.js";

interface TransitionRowUpdateInput {
  current: OperationPollResult;
  transition: ApplyTransitionInput;
  mergedProgress: OperationPollResult["progress"];
  executionDeadline: string | null;
}

function buildHighAssuranceConsumeCasClause(
  sql: TenantScopedSql,
  highAssuranceConsumeCas: NonNullable<ApplyTransitionInput["highAssuranceConsumeCas"]>,
) {
  return sql`
    AND (progress->'highAssuranceChallenge'->>'consumedAt') IS NULL
    AND (progress->'highAssuranceChallenge'->>'challengeId') = ${highAssuranceConsumeCas.challengeId}
    AND (progress->'highAssuranceChallenge'->>'clearedAt') IS NOT NULL
  `;
}

async function updateStandardOperationTransitionRow(
  sql: TenantScopedSql,
  input: TransitionRowUpdateInput,
): Promise<OperationRow | undefined> {
  const rows = await sql<OperationRow[]>`
    UPDATE operations
    SET
      state = ${input.transition.nextState},
      progress = ${bindJsonb(sql, input.mergedProgress)},
      execution_deadline = ${input.executionDeadline},
      updated_at = now()
    WHERE id = ${input.transition.operationId}
      AND org_id = ${input.transition.organizationId}
      AND state = ${input.current.state}
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

async function updateHighAssuranceConsumeOperationTransitionRow(
  sql: TenantScopedSql,
  input: TransitionRowUpdateInput,
  highAssuranceConsumeCas: NonNullable<ApplyTransitionInput["highAssuranceConsumeCas"]>,
): Promise<OperationRow | undefined> {
  const consumeCas = buildHighAssuranceConsumeCasClause(sql, highAssuranceConsumeCas);
  const rows = await sql<OperationRow[]>`
    UPDATE operations
    SET
      state = ${input.transition.nextState},
      progress = ${bindJsonb(sql, input.mergedProgress)},
      execution_deadline = ${input.executionDeadline},
      updated_at = now()
    WHERE id = ${input.transition.operationId}
      AND org_id = ${input.transition.organizationId}
      AND state = ${input.current.state}
      ${consumeCas}
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

export async function updateOperationTransitionRow(
  sql: TenantScopedSql,
  input: TransitionRowUpdateInput,
): Promise<OperationRow | undefined> {
  if (input.transition.highAssuranceConsumeCas === undefined) {
    return await updateStandardOperationTransitionRow(sql, input);
  }

  return await updateHighAssuranceConsumeOperationTransitionRow(
    sql,
    input,
    input.transition.highAssuranceConsumeCas,
  );
}
