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
import type { ProtectedDeliveryTargetKind } from "./protected-delivery-target.js";

export const PROTECTED_CHANGE_PURPOSES = ["promotion", "delivery_config"] as const;
export type ProtectedChangePurpose = (typeof PROTECTED_CHANGE_PURPOSES)[number];

/**
 * The exact protected delivery execution a `delivery_config` Protected Change authorizes,
 * captured at creation from server-validated request input. The approval flow computes the
 * evidence `deliveryTargetFingerprint` from these stored fields — never from caller input
 * (INS-608).
 */
export interface ProtectedChangeDeliveryTargetRef {
  readonly kind: ProtectedDeliveryTargetKind;
  readonly targetId: string;
}

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
  /** Present exactly when `purpose` is `delivery_config` (INS-608). */
  readonly deliveryTarget: ProtectedChangeDeliveryTargetRef | null;
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
  /**
   * The Approval-time delivery-target fingerprint (metadata-only sha256 over the exact tenant,
   * project, Protected Environment, operation kind, and target id). Null for a promotion approval
   * that authorizes no delivery target. This is the ONLY authoritative source enforcement reads for
   * the exact-target match; it is never accepted from the caller (INS-87).
   */
  readonly deliveryTargetFingerprint: string | null;
  /**
   * When this evidence authorized a protected delivery execution. Approval evidence is single-use
   * (INS-607): enforcement consumes it atomically (compare-and-set on `consumed_at IS NULL`) before
   * authorizing, so the same evidence can never authorize a second execution. Null while unconsumed.
   */
  readonly consumedAt: string | null;
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
  /** Required for `delivery_config`, forbidden for `promotion` (INS-608). */
  readonly deliveryTarget?: ProtectedChangeDeliveryTargetRef;
}

export interface TransitionProtectedChangeInput {
  readonly organizationId: OrganizationId;
  readonly protectedChangeId: RequestId;
  readonly nextState: ProtectedChangeState;
  readonly closureReasonCode?: string;
  readonly impactReviewFingerprint?: string;
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
  /**
   * Approval-time delivery-target fingerprint; omitted for a promotion-only approval (INS-87).
   * Server-computed by the approval transition from the stored delivery target — never accepted
   * from route or RPC callers (INS-608).
   */
  readonly deliveryTargetFingerprint?: string;
}
