import type {
  EnvironmentId,
  KnownErrorCode,
  OpaqueResourceId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import type { FirstValueAuditEventCode } from "./audit-event-codes.js";

export type AuditEventOutcome = "success" | "denied";

export type AuditActorType = "user";

export interface AuditActorRef {
  type: AuditActorType;
  userId: UserId;
}

export type AuditResourceType =
  | "organization"
  | "project"
  | "environment"
  | "team"
  | "membership"
  | "secret"
  | "secret_version"
  | "injection_grant"
  | "operation";

export interface AuditResourceRef {
  type: AuditResourceType;
  id: OpaqueResourceId;
}

export interface AuditRequestRef {
  requestId: RequestId;
}

export interface AuditOperationRef {
  operationId: OperationId;
}

/** Metadata-only denial facts (stable error code, not exception text). */
export interface AuditDenialMetadata {
  reasonCode: KnownErrorCode;
}

interface AuditEventInputBase {
  eventCode: FirstValueAuditEventCode;
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  resource?: AuditResourceRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

export interface AuditEventInputSuccess extends AuditEventInputBase {
  outcome: "success";
  denial?: undefined;
}

export interface AuditEventInputDenied extends AuditEventInputBase {
  outcome: "denied";
  denial: AuditDenialMetadata;
}

/** Metadata-only audit event input (Plaintext Metadata Allowlist). */
export type AuditEventInput = AuditEventInputSuccess | AuditEventInputDenied;
