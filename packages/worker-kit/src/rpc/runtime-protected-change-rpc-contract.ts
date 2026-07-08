import type {
  ApprovalRequestId,
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
  readonly toVersionNumber: number;
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

export interface ListEnvironmentApprovalsRpcPayload {
  readonly approvals: readonly EnvironmentApprovalListItemRpcPayload[];
}
