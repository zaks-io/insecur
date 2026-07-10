import { bindJsonb, type TenantScopedSql } from "@insecur/tenant-store";
import type { ApplyTransitionInput } from "./apply-operation-transition.js";
import { type OperationRecord, type OperationRow } from "./operation-row.js";
import type { OperationPollResult } from "./operation-types.js";

interface TransitionRowUpdateInput {
  current: OperationRecord;
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

function buildHighAssuranceDenyCasClause(
  sql: TenantScopedSql,
  highAssuranceDenyCas: NonNullable<ApplyTransitionInput["highAssuranceDenyCas"]>,
) {
  return sql`
    AND (progress->'highAssuranceChallenge'->>'clearedAt') IS NULL
    AND (progress->'highAssuranceChallenge'->>'consumedAt') IS NULL
    AND (progress->'highAssuranceChallenge'->>'challengeId') = ${highAssuranceDenyCas.challengeId}
  `;
}

function resolveHighAssuranceTransitionCasClause(
  sql: TenantScopedSql,
  transition: ApplyTransitionInput,
) {
  if (transition.highAssuranceConsumeCas !== undefined) {
    return buildHighAssuranceConsumeCasClause(sql, transition.highAssuranceConsumeCas);
  }
  if (transition.highAssuranceDenyCas !== undefined) {
    return buildHighAssuranceDenyCasClause(sql, transition.highAssuranceDenyCas);
  }
  return sql``;
}

export async function updateOperationTransitionRow(
  sql: TenantScopedSql,
  input: TransitionRowUpdateInput,
): Promise<OperationRow | undefined> {
  const extraWhereClause = resolveHighAssuranceTransitionCasClause(sql, input.transition);
  const rows = await sql<OperationRow[]>`
    UPDATE operations
    SET
      state = ${input.transition.nextState},
      progress = ${bindJsonb(sql, input.mergedProgress)},
      execution_deadline = ${input.executionDeadline},
      revision = revision + 1,
      updated_at = now()
    WHERE id = ${input.transition.operationId}
      AND org_id = ${input.transition.organizationId}
      AND state = ${input.current.state}
      AND revision = ${input.current.revision}
      ${extraWhereClause}
    RETURNING
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
  `;
  return rows[0];
}
