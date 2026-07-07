import postgres from "postgres";

import type { AuditEventRow, FeedbackRow, OperationRow } from "./audit-verification-types.js";

export async function withServiceRoleSql<T>(
  databaseUrl: string,
  run: (sql: ReturnType<typeof postgres>) => Promise<T>,
): Promise<T> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql`SELECT set_config('app.service', ${"true"}, ${false})`;
    return await run(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function loadOrganizationAuditEvents(
  sql: ReturnType<typeof postgres>,
  organizationId: string,
): Promise<AuditEventRow[]> {
  return await sql<AuditEventRow[]>`
    SELECT
      id,
      org_id AS "orgId",
      event_code AS "eventCode",
      outcome,
      result_code AS "resultCode",
      actor_type AS "actorType",
      actor_user_id AS "actorUserId",
      actor_machine_identity_id AS "actorMachineIdentityId",
      project_id AS "projectId",
      environment_id AS "environmentId",
      resource_type AS "resourceType",
      resource_id AS "resourceId",
      related_resource_type AS "relatedResourceType",
      related_resource_id AS "relatedResourceId",
      request_id AS "requestId",
      operation_id AS "operationId",
      details,
      created_at AS "createdAt"
    FROM audit_events
    WHERE org_id = ${organizationId}
    ORDER BY created_at ASC
  `;
}

export async function loadFeedbackRow(
  sql: ReturnType<typeof postgres>,
  organizationId: string,
  feedbackId: string,
): Promise<FeedbackRow | undefined> {
  const rows = await sql<FeedbackRow[]>`
    SELECT
      id,
      org_id AS "orgId",
      actor_user_id AS "actorUserId",
      feedback_kind AS "feedbackKind",
      note,
      grant_id AS "grantId",
      operation_id AS "operationId",
      request_id AS "requestId"
    FROM first_value_feedback
    WHERE org_id = ${organizationId}
      AND id = ${feedbackId}
    LIMIT 1
  `;
  return rows[0];
}

export async function loadOperationRow(
  sql: ReturnType<typeof postgres>,
  organizationId: string,
  operationId: string,
): Promise<OperationRow | undefined> {
  const rows = await sql<OperationRow[]>`
    SELECT
      id,
      org_id AS "orgId",
      state,
      intent_code AS "intentCode",
      progress
    FROM operations
    WHERE org_id = ${organizationId}
      AND id = ${operationId}
    LIMIT 1
  `;
  return rows[0];
}
