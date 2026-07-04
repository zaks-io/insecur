import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import {
  FIRST_VALUE_AUDIT_EVENT_CODES,
  PRODUCTION_AUDIT_EVENT_CODES,
  recordStorageAudit,
} from "@insecur/audit";
import type {
  EnvironmentId,
  KnownErrorCode,
  OrganizationId,
  ProjectId,
  SecretId,
} from "@insecur/domain";

export type SecretStorageWriteAuditKind = "non_protected" | "protected_draft";

type DeniedWriteAuditScope = readonly [
  organizationId: OrganizationId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
];

type DeniedWriteAuditRefs = readonly [
  secretId: SecretId | undefined,
  request: AuditRequestRef | undefined,
  operation: AuditOperationRef | undefined,
];

export interface DeniedSecretStorageWriteAuditInput {
  kind: SecretStorageWriteAuditKind;
  actor: AuditActorRef;
  scope: DeniedWriteAuditScope;
  refs: DeniedWriteAuditRefs;
  reasonCode: KnownErrorCode;
}

function storageAuditEventCodes(kind: SecretStorageWriteAuditKind) {
  if (kind === "protected_draft") {
    return {
      success: PRODUCTION_AUDIT_EVENT_CODES.secretProtectedDraftWrite,
      denied: PRODUCTION_AUDIT_EVENT_CODES.secretProtectedDraftWriteDenied,
    };
  }
  return {
    success: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWrite,
    denied: FIRST_VALUE_AUDIT_EVENT_CODES.secretNonProtectedWriteDenied,
  };
}

export async function recordSecretStorageWriteAudit(
  kind: SecretStorageWriteAuditKind,
  input: Parameters<typeof recordStorageAudit>[0],
): Promise<Awaited<ReturnType<typeof recordStorageAudit>>> {
  const eventCodes = storageAuditEventCodes(kind);
  return recordStorageAudit({
    ...input,
    eventCode: input.outcome === "success" ? eventCodes.success : eventCodes.denied,
  });
}

export async function recordDeniedSecretStorageWriteAudit(
  input: DeniedSecretStorageWriteAuditInput,
): Promise<void> {
  const [organizationId, projectId, environmentId] = input.scope;
  const [secretId, request, operation] = input.refs;

  await recordSecretStorageWriteAudit(input.kind, {
    outcome: "denied",
    actor: input.actor,
    organizationId,
    projectId,
    environmentId,
    ...(secretId !== undefined ? { secretId } : {}),
    ...(request !== undefined ? { request } : {}),
    ...(operation !== undefined ? { operation } : {}),
    reasonCode: input.reasonCode,
  });
}
