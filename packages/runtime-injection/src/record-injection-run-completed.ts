import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  recordRuntimeInjectionAudit,
  type AuditActorRef,
  type AuditRequestRef,
  type AuditUserActorRef,
} from "@insecur/audit";
import {
  INJECTION_ERROR_CODES,
  projectId,
  environmentId,
  type InjectionGrantId,
  type OrganizationId,
} from "@insecur/domain";
import { TenantInjectionGrantStore, withTenantScope } from "@insecur/tenant-store";

import { assertRuntimeInjectionAccess, CONSUME_SCOPE } from "./assert-runtime-injection-access.js";
import { InjectionGrantError } from "./injection-grant-error.js";

function assertUserActorForRunCompleted(actor: AuditActorRef): asserts actor is AuditUserActorRef {
  if (actor.type !== "user") {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "injection run completion denied",
    );
  }
}

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

function assertValidChildExitCode(childExitCode: number): void {
  if (!Number.isInteger(childExitCode) || childExitCode < 0 || childExitCode > 255) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "child exit code must be an integer from 0 to 255",
    );
  }
}

async function findExistingRunCompletedAuditId(
  organizationId: OrganizationId,
  grantId: InjectionGrantId,
): Promise<string | undefined> {
  return withTenantScope({ kind: "organization", organizationId }, async ({ sql }) => {
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
  });
}

async function assertConsumedGrantForRunCompletion(
  input: RecordInjectionRunCompletedInput,
): Promise<{
  grantProjectId: ReturnType<typeof projectId.brand>;
  grantEnvironmentId: ReturnType<typeof environmentId.brand>;
}> {
  const grant = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) =>
      new TenantInjectionGrantStore(db).getGrant(input.organizationId, input.grantId),
  );
  if (!grant?.consumed_at) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
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

  return { grantProjectId, grantEnvironmentId };
}

/**
 * Records metadata-only run completion for a consumed Injection Grant. Idempotent per grant.
 */
export async function recordInjectionRunCompleted(
  input: RecordInjectionRunCompletedInput,
): Promise<RecordInjectionRunCompletedResult> {
  assertValidChildExitCode(input.childExitCode);

  const existingAuditEventId = await findExistingRunCompletedAuditId(
    input.organizationId,
    input.grantId,
  );
  if (existingAuditEventId !== undefined) {
    return { auditEventId: existingAuditEventId, alreadyRecorded: true };
  }

  const { grantProjectId, grantEnvironmentId } = await assertConsumedGrantForRunCompletion(input);

  const audit = await recordRuntimeInjectionAudit({
    phase: "run",
    outcome: "success",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: grantProjectId,
    environmentId: grantEnvironmentId,
    grantId: input.grantId,
    childExitCode: input.childExitCode,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  if (audit?.auditEventId === undefined) {
    throw new InjectionGrantError(
      INJECTION_ERROR_CODES.grantDenied,
      "injection run completion audit unavailable",
    );
  }

  return { auditEventId: audit.auditEventId, alreadyRecorded: false };
}
