import {
  PRODUCTION_AUDIT_EVENT_CODES,
  writeAuditEvent,
  type AuditRequestRef,
} from "@insecur/audit";
import {
  AUDIT_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  readErrorCode,
  type AuthErrorCode,
  type EnvironmentId,
  type KnownErrorCode,
  type OpaqueResourceId,
  type OrganizationId,
  type ProjectId,
  type RuntimePolicyId,
  type RuntimePolicyVersionId,
  type UserId,
} from "@insecur/domain";

function policyResource(policyId: RuntimePolicyId): {
  type: "runtime_injection_policy";
  id: OpaqueResourceId;
} {
  return {
    type: "runtime_injection_policy",
    id: brandOpaqueResourceIdForPrefix("rp", policyId),
  };
}

interface PolicyAuditScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly request?: AuditRequestRef;
}

export async function recordRuntimeInjectionPolicyCreated(
  input: PolicyAuditScope & {
    readonly policyId: RuntimePolicyId;
    readonly policyVersionId: RuntimePolicyVersionId;
  },
): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyCreated,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: policyResource(input.policyId),
    details: {
      policyVersionId: input.policyVersionId,
    },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  return { auditEventId: result.auditEventId };
}

export async function recordRuntimeInjectionPolicyCreateDenied(
  input: PolicyAuditScope & {
    readonly reasonCode: KnownErrorCode | AuthErrorCode;
    readonly policyId?: RuntimePolicyId;
  },
): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyCreateDenied,
    outcome: "denied",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    ...(input.policyId !== undefined ? { resource: policyResource(input.policyId) } : {}),
    denial: { reasonCode: input.reasonCode },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordRuntimeInjectionPolicyDisabled(
  input: PolicyAuditScope & {
    readonly policyId: RuntimePolicyId;
    readonly comment: string;
  },
): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyDisabled,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: policyResource(input.policyId),
    details: {
      commentLength: input.comment.length,
    },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  return { auditEventId: result.auditEventId };
}

export async function recordRuntimeInjectionPolicyDisableDenied(
  input: PolicyAuditScope & {
    readonly reasonCode: KnownErrorCode | AuthErrorCode;
    readonly policyId: RuntimePolicyId;
  },
): Promise<void> {
  await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.runtimeInjectionPolicyDisableDenied,
    outcome: "denied",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: policyResource(input.policyId),
    denial: { reasonCode: input.reasonCode },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export function toPolicyAuditReasonCode(error: unknown): KnownErrorCode | AuthErrorCode {
  return readErrorCode(error) ?? AUDIT_ERROR_CODES.eventInvalid;
}
