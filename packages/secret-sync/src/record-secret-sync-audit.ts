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
  type SecretId,
  type SecretSyncBindingId,
  type SecretSyncId,
  type UserId,
} from "@insecur/domain";

function secretSyncResource(secretSyncId: SecretSyncId): {
  type: "secret_sync";
  id: OpaqueResourceId;
} {
  return {
    type: "secret_sync",
    id: brandOpaqueResourceIdForPrefix("sync", secretSyncId),
  };
}

export interface SecretSyncAuditScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly request?: AuditRequestRef;
}

export interface SecretSyncBindingAuditDetails {
  readonly bindingCount: number;
  readonly secretIdsCsv: string;
  readonly bindingIdsCsv: string;
}

export async function recordSecretSyncCreated(
  input: SecretSyncAuditScope & {
    readonly secretSyncId: SecretSyncId;
    readonly bindings: SecretSyncBindingAuditDetails;
  },
): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.secretSyncCreated,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: secretSyncResource(input.secretSyncId),
    details: {
      bindingCount: input.bindings.bindingCount,
      secretIdsCsv: input.bindings.secretIdsCsv,
      bindingIdsCsv: input.bindings.bindingIdsCsv,
    },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  return { auditEventId: result.auditEventId };
}

async function writeSecretSyncDeniedAudit(
  input: SecretSyncAuditScope & {
    readonly eventCode:
      | typeof PRODUCTION_AUDIT_EVENT_CODES.secretSyncCreateDenied
      | typeof PRODUCTION_AUDIT_EVENT_CODES.secretSyncUpdateDenied
      | typeof PRODUCTION_AUDIT_EVENT_CODES.secretSyncDisableDenied;
    readonly reasonCode: KnownErrorCode | AuthErrorCode;
    readonly secretSyncId?: SecretSyncId;
  },
): Promise<void> {
  await writeAuditEvent({
    eventCode: input.eventCode,
    outcome: "denied",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    ...(input.secretSyncId !== undefined
      ? { resource: secretSyncResource(input.secretSyncId) }
      : {}),
    denial: { reasonCode: input.reasonCode },
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export async function recordSecretSyncCreateDenied(
  input: SecretSyncAuditScope & {
    readonly reasonCode: KnownErrorCode | AuthErrorCode;
    readonly secretSyncId?: SecretSyncId;
  },
): Promise<void> {
  await writeSecretSyncDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.secretSyncCreateDenied,
  });
}

export async function recordSecretSyncUpdated(
  input: SecretSyncAuditScope & {
    readonly secretSyncId: SecretSyncId;
    readonly bindings?: SecretSyncBindingAuditDetails;
  },
): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.secretSyncUpdated,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: secretSyncResource(input.secretSyncId),
    ...(input.bindings !== undefined
      ? {
          details: {
            bindingCount: input.bindings.bindingCount,
            secretIdsCsv: input.bindings.secretIdsCsv,
            bindingIdsCsv: input.bindings.bindingIdsCsv,
          },
        }
      : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  return { auditEventId: result.auditEventId };
}

export async function recordSecretSyncUpdateDenied(
  input: SecretSyncAuditScope & {
    readonly reasonCode: KnownErrorCode | AuthErrorCode;
    readonly secretSyncId: SecretSyncId;
  },
): Promise<void> {
  await writeSecretSyncDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.secretSyncUpdateDenied,
  });
}

export async function recordSecretSyncDisabled(
  input: SecretSyncAuditScope & {
    readonly secretSyncId: SecretSyncId;
  },
): Promise<{ auditEventId: string }> {
  const result = await writeAuditEvent({
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.secretSyncDisabled,
    outcome: "success",
    actor: { type: "user", userId: input.actorUserId },
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: secretSyncResource(input.secretSyncId),
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
  return { auditEventId: result.auditEventId };
}

export async function recordSecretSyncDisableDenied(
  input: SecretSyncAuditScope & {
    readonly reasonCode: KnownErrorCode | AuthErrorCode;
    readonly secretSyncId: SecretSyncId;
  },
): Promise<void> {
  await writeSecretSyncDeniedAudit({
    ...input,
    eventCode: PRODUCTION_AUDIT_EVENT_CODES.secretSyncDisableDenied,
  });
}

export function toSecretSyncAuditReasonCode(error: unknown): KnownErrorCode | AuthErrorCode {
  return readErrorCode(error) ?? AUDIT_ERROR_CODES.eventInvalid;
}

export function toBindingAuditDetails(input: {
  readonly bindings: readonly {
    readonly id: SecretSyncBindingId;
    readonly secretId: SecretId;
  }[];
}): SecretSyncBindingAuditDetails {
  return {
    bindingCount: input.bindings.length,
    secretIdsCsv: input.bindings.map((binding) => binding.secretId).join(","),
    bindingIdsCsv: input.bindings.map((binding) => binding.id).join(","),
  };
}
