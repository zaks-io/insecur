import {
  PRODUCTION_AUDIT_EVENT_CODES,
  writeAuditEvent,
  type AuditRequestRef,
} from "@insecur/audit";
import {
  AUDIT_ERROR_CODES,
  brandOpaqueResourceIdForPrefix,
  isStableDottedCode,
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

export function secretSyncResource(secretSyncId: SecretSyncId): {
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

/**
 * Guard-compatible binding details: audit detail strings must each be a single
 * opaque resource ID (ADR-0068), so bindings are recorded as indexed primitive
 * keys (`secretId1`/`bindingId1`, ...) plus a `bindingCount`, never CSV.
 */
export type SecretSyncBindingAuditDetails = Readonly<Record<string, string | number | boolean>>;

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
    details: input.bindings,
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
    ...(input.bindings !== undefined ? { details: input.bindings } : {}),
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

/**
 * Denial audits require a stable dotted reason code. `readErrorCode` passes through any string
 * `code` (a raw SQLSTATE like `58000` included), and an invalid reasonCode would make the audit
 * write itself throw from the catch block — masking the original error and dropping the denial
 * record. Non-dotted codes collapse to the fallback instead.
 */
export function toSecretSyncAuditReasonCode(
  error: unknown,
  fallback: KnownErrorCode | AuthErrorCode = AUDIT_ERROR_CODES.eventInvalid,
): KnownErrorCode | AuthErrorCode {
  const code = readErrorCode(error);
  return code !== undefined && isStableDottedCode(code) ? code : fallback;
}

export function toBindingAuditDetails(input: {
  readonly bindings: readonly {
    readonly id: SecretSyncBindingId;
    readonly secretId: SecretId;
  }[];
}): SecretSyncBindingAuditDetails {
  const details: Record<string, string | number> = {
    bindingCount: input.bindings.length,
  };
  input.bindings.forEach((binding, index) => {
    const ordinal = String(index + 1);
    details[`secretId${ordinal}`] = binding.secretId;
    details[`bindingId${ordinal}`] = binding.id;
  });
  return details;
}
