import type {
  AuditEventId,
  EnvironmentId,
  MachineIdentityId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  SecretVersionId,
  UserId,
} from "@insecur/domain";

import type { ProtectedChangeState } from "./protected-change-states.js";

export const PROTECTED_CHANGE_PURPOSES = ["promotion"] as const;
export type ProtectedChangePurpose = (typeof PROTECTED_CHANGE_PURPOSES)[number];

export interface ProtectedChangeActorRef {
  readonly userId?: UserId;
  readonly machineIdentityId?: MachineIdentityId;
}

export interface ProtectedChangeRecord {
  readonly protectedChangeId: RequestId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly state: ProtectedChangeState;
  readonly purpose: ProtectedChangePurpose;
  readonly requesterUserId: UserId | null;
  readonly requesterMachineIdentityId: MachineIdentityId | null;
  readonly draftVersionIds: readonly SecretVersionId[];
  readonly impactReviewFingerprint: string | null;
  readonly executionOperationId: OperationId | null;
  readonly closureReasonCode: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProtectedChangeApprovalEvidence {
  readonly evidenceId: AuditEventId;
  readonly organizationId: OrganizationId;
  readonly protectedChangeId: RequestId;
  readonly approverUserId: UserId;
  readonly auditEventId: AuditEventId;
  readonly operationId: OperationId | null;
  readonly impactReviewFingerprint: string;
  readonly createdAt: string;
}

export interface CreateProtectedChangeInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly protectedChangeId: RequestId;
  readonly requester: ProtectedChangeActorRef;
  readonly draftVersionIds: readonly SecretVersionId[];
  readonly purpose?: ProtectedChangePurpose;
}

export interface TransitionProtectedChangeInput {
  readonly organizationId: OrganizationId;
  readonly protectedChangeId: RequestId;
  readonly nextState: ProtectedChangeState;
  readonly closureReasonCode?: string;
  readonly impactReviewFingerprint?: string;
  /** When set, skips server-side recompute and uses this fingerprint for stale checks (INS-496). */
  readonly currentImpactFingerprint?: string;
  readonly executionOperationId?: OperationId;
}

export interface RecordProtectedChangeApprovalEvidenceInput {
  readonly organizationId: OrganizationId;
  readonly protectedChangeId: RequestId;
  readonly evidenceId: AuditEventId;
  readonly approverUserId: UserId;
  readonly auditEventId: AuditEventId;
  readonly operationId?: OperationId;
  readonly impactReviewFingerprint: string;
}
