import type {
  AuditEventId,
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
import type {
  AuditActorType,
  AuditEventDetails,
  AuditEventOutcome,
  AuditResourceType,
} from "./audit-types.js";

/** Metadata-only actor reference for audit read envelopes and principal-chain rendering. */
export interface AuditEventActorRead {
  readonly actorType: AuditActorType;
  readonly userId?: UserId;
  readonly machineIdentityId?: MachineIdentityId;
}

export interface AuditEventResourceRead {
  readonly type: AuditResourceType;
  readonly id: OpaqueResourceId;
}

/** Metadata-only audit event row for tenant query reads (no Sensitive Values). */
export interface AuditEventRead {
  readonly auditEventId: AuditEventId;
  readonly organizationId: OrganizationId;
  readonly eventCode: AuditEventCode;
  readonly outcome: AuditEventOutcome;
  readonly resultCode: KnownErrorCode;
  readonly actor: AuditEventActorRead;
  readonly projectId: ProjectId | null;
  readonly environmentId: EnvironmentId | null;
  readonly resource: AuditEventResourceRead | null;
  readonly relatedResource: AuditEventResourceRead | null;
  readonly requestId: RequestId | null;
  readonly operationId: OperationId | null;
  /** Agent-session / harness attribution and other allowlisted metadata live here. */
  readonly details: AuditEventDetails | null;
  readonly createdAt: string;
}

export interface AuditEventsPage {
  readonly events: readonly AuditEventRead[];
  readonly nextCursor: string | null;
}
