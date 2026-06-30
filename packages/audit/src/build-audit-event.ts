import type { AuditEventCode } from "./audit-event-codes.js";
import type {
  AuditActorRef,
  AuditCorrelationRefs,
  AuditDenialMetadata,
  AuditEventDetails,
  AuditEventInput,
  AuditResourceRef,
  AuditTenantScope,
} from "./audit-types.js";
import { validateAuditEventInput } from "./validate-audit-event.js";

interface BuildAuditEventBaseInput extends AuditTenantScope, AuditCorrelationRefs {
  eventCode: AuditEventCode;
  actor: AuditActorRef;
  resource?: AuditResourceRef;
  relatedResource?: AuditResourceRef;
  details?: AuditEventDetails;
}

export interface BuildAuditEventSuccessInput extends BuildAuditEventBaseInput {
  outcome: "success";
}

export interface BuildAuditEventDeniedInput extends BuildAuditEventBaseInput {
  outcome: "denied";
  denial: AuditDenialMetadata;
}

export type BuildAuditEventInput = BuildAuditEventSuccessInput | BuildAuditEventDeniedInput;

function correlationFields(input: AuditCorrelationRefs) {
  return {
    ...(input.request !== undefined ? { request: input.request } : {}),
    ...(input.operation !== undefined ? { operation: input.operation } : {}),
  };
}

function scopeFields(input: AuditTenantScope) {
  return {
    organizationId: input.organizationId,
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(input.environmentId !== undefined ? { environmentId: input.environmentId } : {}),
  };
}

/**
 * Assembles a tenant-qualified audit event and validates metadata safety before
 * persistence. Callers should prefer this over hand-built objects for common paths.
 */
export function buildAuditEventInput(input: BuildAuditEventInput): AuditEventInput {
  const base = {
    eventCode: input.eventCode,
    actor: input.actor,
    ...scopeFields(input),
    ...correlationFields(input),
    ...(input.resource !== undefined ? { resource: input.resource } : {}),
    ...(input.relatedResource !== undefined ? { relatedResource: input.relatedResource } : {}),
    ...(input.details !== undefined ? { details: input.details } : {}),
  };

  const event: AuditEventInput =
    input.outcome === "success"
      ? { ...base, outcome: "success" }
      : { ...base, outcome: "denied", denial: input.denial };

  validateAuditEventInput(event);
  return event;
}
