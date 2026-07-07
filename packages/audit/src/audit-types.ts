import type {
  EnvironmentId,
  KnownErrorCode,
  MachineIdentityId,
  OpaqueResourceId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import type { AuditEventCode } from "./audit-event-codes.js";

export type AuditEventOutcome = "success" | "denied";

export type AuditActorType = "user" | "machine" | "ci_exchange";

export interface AuditUserActorRef {
  type: "user";
  userId: UserId;
}

/** User actor on persisted audit events when the insecur user id is unknown. */
export interface AuditEventUserActorRef {
  type: "user";
  userId: UserId | null;
}

export interface AuditMachineActorRef {
  type: "machine";
  machineIdentityId: MachineIdentityId;
}

/** Unauthenticated GitHub Actions OIDC exchange attempt (no matched Machine Identity). */
interface AuditCiExchangeActorRef {
  type: "ci_exchange";
}

export type AuditActorRef = AuditUserActorRef | AuditMachineActorRef | AuditCiExchangeActorRef;

export type AuditEventActorRef =
  AuditEventUserActorRef | AuditMachineActorRef | AuditCiExchangeActorRef;

export type AuditResourceType =
  | "organization"
  | "project"
  | "environment"
  | "team"
  | "membership"
  | "invitation"
  | "secret"
  | "secret_version"
  | "injection_grant"
  | "operation"
  | "app_connection"
  | "secret_sync"
  | "approval_request"
  | "organization_data_key"
  | "project_data_key"
  | "machine_identity"
  | "machine_auth_method";

export interface AuditResourceRef {
  type: AuditResourceType;
  id: OpaqueResourceId;
}

/** Request-scoped correlation identifier for audit and operation records. */
export interface AuditRequestRef {
  requestId: RequestId;
}

/** Operation-scoped correlation identifier for long-running work. */
export interface AuditOperationRef {
  operationId: OperationId;
}

/**
 * Correlation identifiers carried on audit events. `requestId` and `operationId`
 * are the supported correlation fields; both are metadata-only opaque IDs.
 */
export interface AuditCorrelationRefs {
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
}

/** Metadata-only denial facts (stable error code, not exception text). */
export interface AuditDenialMetadata {
  reasonCode: KnownErrorCode;
}

/** Primitive-only detail map with value-type guard (dotted codes, opaque IDs, numbers, booleans). */
export type AuditEventDetailValue = string | number | boolean | null;

export type AuditEventDetails = Readonly<Record<string, AuditEventDetailValue>>;

export interface AuditTenantScope {
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
}

interface AuditEventInputBase extends AuditTenantScope {
  eventCode: AuditEventCode;
  actor: AuditEventActorRef;
  resource?: AuditResourceRef;
  /** Secondary metadata-only resource (e.g. delivered Secret Version on grant consume). */
  relatedResource?: AuditResourceRef;
  request?: AuditRequestRef;
  operation?: AuditOperationRef;
  /** Optional metadata-safe detail keys with constrained primitive values. */
  details?: AuditEventDetails;
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
