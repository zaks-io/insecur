import type {
  ApprovalRequestId,
  EnvironmentId,
  MachineIdentityId,
  OperationId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  UserId,
} from "@insecur/domain";
import type {
  ApprovalRequestPurpose,
  ApprovalRequestStatus,
  EnvironmentDeliveryImpactFacts,
  PromotionDraftVersionImpactFact,
} from "@insecur/tenant-store";

/** Metadata-only review row for Human Approval Surface inbox reads (INS-86). */
export interface ApprovalRequestReviewListItem {
  readonly approvalRequestId: ApprovalRequestId;
  readonly purpose: ApprovalRequestPurpose;
  readonly status: ApprovalRequestStatus;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requestedAt: string;
  readonly operationId: OperationId | null;
  readonly requestingUserId: UserId | null;
  readonly requestingMachineIdentityId: MachineIdentityId | null;
}

export interface ApprovalRequestImpactReviewEvidence {
  readonly fingerprintAtCreation: string | null;
  readonly currentFingerprint: string;
  readonly isStale: boolean;
  readonly draftVersions: readonly PromotionDraftVersionImpactFact[];
  readonly delivery: EnvironmentDeliveryImpactFacts;
}

/** Metadata-only detail read for one Approval Request (INS-86). */
export interface ApprovalRequestReviewDetail extends ApprovalRequestReviewListItem {
  readonly organizationId: OrganizationId;
  readonly commentLength: number | null;
  readonly rollbackSecretId: SecretId | null;
  readonly rollbackToVersionId: SecretVersionId | null;
  readonly rollbackPromoteRequested: boolean;
  readonly impactReview: ApprovalRequestImpactReviewEvidence;
}
