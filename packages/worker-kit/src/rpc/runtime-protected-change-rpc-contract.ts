import type { EvaluateHighAssuranceChallengeClearInput } from "@insecur/auth";
import type {
  ApprovalRequestId,
  ApprovalRequestImpactDeliveryMetadata,
  EnvironmentId,
  OperationId,
  OrganizationId,
  ProjectId,
  RequestId,
  SecretId,
  SecretVersionId,
} from "@insecur/domain";
import type { PostAuthRpcInputBase } from "./runtime-rpc-shared.js";

export interface RequestProtectedPromotionRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly draftVersionIds: readonly SecretVersionId[];
  readonly comment?: string;
  readonly impactReviewFingerprint?: string;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}

export interface RequestProtectedPromotionRpcPayload {
  readonly approvalRequestId: ApprovalRequestId;
  readonly operationId?: OperationId;
  readonly impactReviewFingerprint: string;
  readonly supersededApprovalRequestIds: readonly ApprovalRequestId[];
  readonly draftVersionIds: readonly SecretVersionId[];
}

export interface RequestProtectedRollbackRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
  readonly toVersionId: SecretVersionId;
  readonly promoteRequested: boolean;
  readonly comment?: string;
  readonly impactReviewFingerprint?: string;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}

export interface RequestProtectedRollbackRpcPayload {
  readonly approvalRequestId?: ApprovalRequestId;
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
  readonly versionNumber: number;
  readonly lifecycleState: string;
  readonly operationId?: OperationId;
}

export interface ListEnvironmentApprovalsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requestId: RequestId;
}

export interface EnvironmentApprovalListItemRpcPayload {
  readonly approvalRequestId: ApprovalRequestId;
  readonly purpose: string;
  readonly status: string;
  readonly createdAt: string;
  readonly operationId: string | null;
}

export interface ApprovalRequestReviewListItemRpcPayload {
  readonly approvalRequestId: ApprovalRequestId;
  readonly purpose: string;
  readonly status: string;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requestedAt: string;
  readonly operationId: OperationId | null;
  readonly requestingUserId: string | null;
  readonly requestingMachineIdentityId: string | null;
}

export interface ApprovalRequestImpactReviewRpcPayload {
  readonly fingerprintAtCreation: string | null;
  readonly currentFingerprint: string;
  readonly isStale: boolean;
  readonly draftVersions: readonly {
    readonly secretId: SecretId;
    readonly secretVersionId: SecretVersionId;
    readonly valueByteLength: number;
    readonly encodingClass: string;
    readonly secretShapeMatchVerdict: string;
  }[];
  readonly delivery: ApprovalRequestImpactDeliveryMetadata;
}

export interface ApprovalRequestReviewDetailRpcPayload extends ApprovalRequestReviewListItemRpcPayload {
  readonly organizationId: OrganizationId;
  readonly commentLength: number | null;
  readonly rollbackSecretId: SecretId | null;
  readonly rollbackToVersionId: SecretVersionId | null;
  readonly rollbackPromoteRequested: boolean;
  readonly impactReview: ApprovalRequestImpactReviewRpcPayload;
}

export interface ListEnvironmentApprovalsRpcPayload {
  readonly approvals: readonly EnvironmentApprovalListItemRpcPayload[];
}

export interface ListPendingApprovalRequestsRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly requestId: RequestId;
}

export interface ListPendingApprovalRequestsRpcPayload {
  readonly approvalRequests: readonly ApprovalRequestReviewListItemRpcPayload[];
}

export interface GetApprovalRequestReviewRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly requestId: RequestId;
}

export interface GetApprovalRequestReviewRpcPayload {
  readonly approvalRequest: ApprovalRequestReviewDetailRpcPayload;
}

export interface ApproveApprovalRequestRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly impactReviewFingerprint: string;
  readonly sessionAssurance: EvaluateHighAssuranceChallengeClearInput;
  readonly requestId: RequestId;
}

export interface ApproveApprovalRequestRpcPayload {
  readonly approvalRequestId: ApprovalRequestId;
  readonly status: "approved_applied";
}

export interface RejectApprovalRequestRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly requestId: RequestId;
}

export interface RejectApprovalRequestRpcPayload {
  readonly approvalRequestId: ApprovalRequestId;
  readonly status: "rejected";
}

export interface CancelApprovalRequestRpcInput extends PostAuthRpcInputBase {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly approvalRequestId: ApprovalRequestId;
  readonly requestId: RequestId;
}

export interface CancelApprovalRequestRpcPayload {
  readonly approvalRequestId: ApprovalRequestId;
  readonly status: "canceled";
}
