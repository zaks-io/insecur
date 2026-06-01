import type {
  AuditEventId,
  EnvironmentId,
  OpaqueResourceId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  UserId,
} from "@insecur/domain";
import { NotImplementedError } from "@insecur/domain";

export interface AuditActorRef {
  type: "user";
  userId: UserId;
}

/** Metadata-only audit event input (Plaintext Metadata Allowlist). */
export interface AuditEventInput {
  eventCode: string;
  outcome: "success" | "denied";
  actor: AuditActorRef;
  organizationId: OrganizationId;
  projectId?: ProjectId;
  environmentId?: EnvironmentId;
  resource?: {
    type: string;
    id: OpaqueResourceId;
  };
  requestId?: RequestId;
  operationId?: OperationId;
}

export interface AuditEventResult {
  auditEventId: AuditEventId;
}

/**
 * Records a tenant-qualified metadata-only audit event.
 */
export function writeAuditEvent(event: AuditEventInput): Promise<AuditEventResult> {
  void event;
  return Promise.reject(new NotImplementedError("writeAuditEvent"));
}
