import { firstValueFeedbackId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { withTenantScope } from "@insecur/tenant-store";

import {
  parseFirstValueFeedbackInput,
  throwFirstValueFeedbackValidationError,
  type CaptureFirstValueFeedbackInput,
  type ParsedFirstValueFeedbackInput,
} from "./first-value-feedback.js";

export interface CaptureFirstValueFeedbackResult {
  feedbackId: string;
}

function toInsertRow(input: ParsedFirstValueFeedbackInput) {
  return {
    id: firstValueFeedbackId.generate(),
    orgId: input.organizationId,
    actorUserId: input.actorUserId,
    feedbackKind: input.feedbackKind,
    note: input.note,
    grantId: input.grantId ?? null,
    operationId: input.operationId ?? null,
    requestId: input.requestId ?? null,
  };
}

async function insertFirstValueFeedbackRow(
  sql: TenantScopedSql,
  input: ParsedFirstValueFeedbackInput,
): Promise<CaptureFirstValueFeedbackResult> {
  const row = toInsertRow(input);
  await sql`
    INSERT INTO first_value_feedback (
      id,
      org_id,
      actor_user_id,
      feedback_kind,
      note,
      grant_id,
      operation_id,
      request_id
    ) VALUES (
      ${row.id},
      ${row.orgId},
      ${row.actorUserId},
      ${row.feedbackKind},
      ${row.note},
      ${row.grantId},
      ${row.operationId},
      ${row.requestId}
    )
  `;
  return { feedbackId: row.id };
}

/**
 * Persists metadata-only design-partner feedback associated with a First Value run or session.
 */
export async function captureFirstValueFeedback(
  input: CaptureFirstValueFeedbackInput,
): Promise<CaptureFirstValueFeedbackResult> {
  const parsed = parseFirstValueFeedbackInput(input);
  if (!parsed.ok) {
    throwFirstValueFeedbackValidationError(parsed.code);
  }

  return withTenantScope(
    { kind: "organization", organizationId: parsed.value.organizationId },
    async ({ sql }) => insertFirstValueFeedbackRow(sql, parsed.value),
  );
}

export async function captureFirstValueFeedbackInTenantScope(
  sql: TenantScopedSql,
  input: CaptureFirstValueFeedbackInput,
): Promise<CaptureFirstValueFeedbackResult> {
  const parsed = parseFirstValueFeedbackInput(input);
  if (!parsed.ok) {
    throwFirstValueFeedbackValidationError(parsed.code);
  }
  return insertFirstValueFeedbackRow(sql, parsed.value);
}
