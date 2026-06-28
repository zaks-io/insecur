import type { AuditActorRef, AuditOperationRef, AuditRequestRef } from "@insecur/audit";
import type { EnvironmentId, OrganizationId, ProjectId, SecretId } from "@insecur/domain";

import {
  recordSecretWriteAudit,
  type RecordSecretWriteAuditInput,
} from "./record-secret-write-audit.js";

export type DeniedWriteAuditScope = readonly [
  organizationId: OrganizationId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
];

export type DeniedWriteAuditRefs = readonly [
  secretId: SecretId | undefined,
  request: AuditRequestRef | undefined,
  operation: AuditOperationRef | undefined,
];

export type DeniedWriteAuditReasonCode = NonNullable<RecordSecretWriteAuditInput["reasonCode"]>;

/** Records a metadata-only denied non-protected secret write audit event. */
export async function recordDeniedWriteAudit(
  actor: AuditActorRef,
  [organizationId, projectId, environmentId]: DeniedWriteAuditScope,
  [secretId, request, operation]: DeniedWriteAuditRefs,
  reasonCode: DeniedWriteAuditReasonCode,
): Promise<void> {
  await recordSecretWriteAudit({
    outcome: "denied",
    actor,
    organizationId,
    projectId,
    environmentId,
    ...(secretId !== undefined ? { secretId } : {}),
    ...(request !== undefined ? { request } : {}),
    ...(operation !== undefined ? { operation } : {}),
    reasonCode,
  });
}
