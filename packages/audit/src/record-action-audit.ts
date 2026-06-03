import type { EnvironmentId, KnownErrorCode, OrganizationId, ProjectId } from "@insecur/domain";

import type { AuditEventCode } from "./audit-event-codes.js";
import type {
  AuditActorRef,
  AuditOperationRef,
  AuditRequestRef,
  AuditResourceRef,
} from "./audit-types.js";
import { type AuditEventResult, writeAuditEvent } from "./write-audit-event.js";

export interface RecordActionAuditInput {
  outcome: "success" | "denied";
  eventCode: AuditEventCode;
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  resource?: AuditResourceRef;
  relatedResource?: AuditResourceRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
  reasonCode?: KnownErrorCode;
}

export type ActionAuditScopeInput = Pick<
  RecordActionAuditInput,
  | "actor"
  | "organizationId"
  | "projectId"
  | "environmentId"
  | "resource"
  | "relatedResource"
  | "request"
  | "operation"
>;

/** Shared tenant scope, correlation, and resource fields for action audit writers. */
export function actionAuditScopeFields(input: ActionAuditScopeInput) {
  return {
    actor: input.actor,
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
    ...(input.resource !== undefined ? { resource: input.resource } : {}),
    ...(input.relatedResource !== undefined ? { relatedResource: input.relatedResource } : {}),
  };
}

/**
 * Assembles tenant-qualified audit base fields and records a metadata-only
 * success or denied action event through {@link writeAuditEvent}.
 */
export async function recordActionAudit(
  input: RecordActionAuditInput,
): Promise<AuditEventResult | undefined> {
  const base = actionAuditScopeFields(input);

  if (input.outcome === "success") {
    return writeAuditEvent({
      ...base,
      eventCode: input.eventCode,
      outcome: "success",
    });
  }

  if (input.reasonCode === undefined) {
    return undefined;
  }

  return writeAuditEvent({
    ...base,
    eventCode: input.eventCode,
    outcome: "denied",
    denial: { reasonCode: input.reasonCode },
  });
}
