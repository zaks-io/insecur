import { recordActionAudit, type AuditActorRef } from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  type EnvironmentId,
  type KnownErrorCode,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";

import {
  ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES,
  type EnvironmentLifecycleAuditEventCode,
} from "./environment-lifecycle-audit-codes.js";

export interface RecordEnvironmentLifecycleAuditInput {
  outcome: "success" | "denied";
  eventCode: EnvironmentLifecycleAuditEventCode;
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  request?: { requestId: RequestId };
  reasonCode?: KnownErrorCode;
}

export async function recordEnvironmentLifecycleAudit(
  input: RecordEnvironmentLifecycleAuditInput,
): Promise<{ auditEventId: string }> {
  if (input.outcome === "denied") {
    return recordActionAudit({
      outcome: "denied",
      eventCode: input.eventCode,
      actor: input.actor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      ...(input.request !== undefined ? { request: input.request } : {}),
      reasonCode: input.reasonCode ?? AUTH_ERROR_CODES.insufficientScope,
    });
  }

  return recordActionAudit({
    outcome: "success",
    eventCode: input.eventCode,
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    ...(input.request !== undefined ? { request: input.request } : {}),
  });
}

export { ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES };
