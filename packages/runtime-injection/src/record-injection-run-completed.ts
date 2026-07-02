import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  recordRuntimeInjectionAuditInTenantScope,
  type AuditActorRef,
  type AuditRequestRef,
  type AuditUserActorRef,
} from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
  parseChildExitCode,
  projectId,
  environmentId,
  type InjectionGrantId,
  type OrganizationId,
} from "@insecur/domain";
import {
  TenantInjectionGrantStore,
  withTenantScope,
  type TenantScopedHandles,
  type TenantScopedSql,
} from "@insecur/tenant-store";

import { assertRuntimeInjectionAccess, CONSUME_SCOPE } from "./assert-runtime-injection-access.js";
import { InjectionGrantError } from "./injection-grant-error.js";

export interface RecordInjectionRunCompletedInput {
  organizationId: OrganizationId;
  grantId: InjectionGrantId;
  childExitCode: number;
  actor: AuditActorRef;
  request?: AuditRequestRef;
}

export interface RecordInjectionRunCompletedResult {
  auditEventId: string;
  alreadyRecorded: boolean;
}

function assertUserActorForRunCompleted(actor: AuditActorRef): asserts actor is AuditUserActorRef {
  if (actor.type !== "user") {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "injection run completion denied",
    );
  }
}

function assertValidChildExitCode(childExitCode: number): number {
  const parsed = parseChildExitCode(childExitCode);
  if (!parsed.ok) {
    throw Object.assign(new Error("child exit code is invalid"), { code: parsed.code });
  }
  return parsed.value;
}

async function findExistingRunCompletedAuditId(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  grantId: InjectionGrantId,
): Promise<string | undefined> {
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM audit_events
    WHERE org_id = ${organizationId}
      AND event_code = ${FIRST_VALUE_AUDIT_EVENT_CODES.injectionRunCompleted}
      AND resource_id = ${grantId}
    ORDER BY created_at
    LIMIT 1
  `;
  return rows[0]?.id;
}

async function lockRunCompletedGrant(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  grantId: InjectionGrantId,
): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId}), hashtext(${grantId}))`;
}

async function assertConsumedGrantForRunCompletion(
  handles: TenantScopedHandles,
  input: RecordInjectionRunCompletedInput,
): Promise<{
  grantProjectId: ReturnType<typeof projectId.brand>;
  grantEnvironmentId: ReturnType<typeof environmentId.brand>;
}> {
  const grant = await new TenantInjectionGrantStore(handles.db).getGrant(
    input.organizationId,
    input.grantId,
  );
  if (grant === null) {
    throw new InjectionGrantError(
      AUTH_ERROR_CODES.insufficientScope,
      "injection run completion denied",
    );
  }

  const grantProjectId = projectId.brand(grant.project_id);
  const grantEnvironmentId = environmentId.brand(grant.environment_id);
  assertUserActorForRunCompleted(input.actor);
  await assertRuntimeInjectionAccess(
    input.actor,
    {
      organizationId: input.organizationId,
      projectId: grantProjectId,
      environmentId: grantEnvironmentId,
    },
    CONSUME_SCOPE,
  );

  if (!grant.consumed_at) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "injection run completion denied",
    );
  }

  return { grantProjectId, grantEnvironmentId };
}

async function recordRunCompletedInTenantScope(
  handles: TenantScopedHandles,
  input: RecordInjectionRunCompletedInput,
  childExitCode: number,
): Promise<RecordInjectionRunCompletedResult> {
  await lockRunCompletedGrant(handles.sql, input.organizationId, input.grantId);

  const { grantProjectId, grantEnvironmentId } = await assertConsumedGrantForRunCompletion(
    handles,
    input,
  );

  const existingAuditEventId = await findExistingRunCompletedAuditId(
    handles.sql,
    input.organizationId,
    input.grantId,
  );
  if (existingAuditEventId !== undefined) {
    return { auditEventId: existingAuditEventId, alreadyRecorded: true };
  }

  const audit = await recordRuntimeInjectionAuditInTenantScope(handles.sql, {
    phase: "run",
    outcome: "success",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: grantProjectId,
    environmentId: grantEnvironmentId,
    grantId: input.grantId,
    childExitCode,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });

  return { auditEventId: audit.auditEventId, alreadyRecorded: false };
}

/**
 * Records metadata-only run completion for a consumed Injection Grant. Idempotent per grant.
 */
export async function recordInjectionRunCompleted(
  input: RecordInjectionRunCompletedInput,
): Promise<RecordInjectionRunCompletedResult> {
  const childExitCode = assertValidChildExitCode(input.childExitCode);

  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    (handles) => recordRunCompletedInTenantScope(handles, input, childExitCode),
  );
}
