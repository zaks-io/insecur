import type { ActorRef } from "@insecur/access";
import {
  approvalRequestId,
  type EnvironmentId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type SecretVersionId,
} from "@insecur/domain";

export interface RequestProtectedPromotionInput {
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly draftVersionIds: readonly SecretVersionId[];
  readonly comment?: string;
  readonly impactReviewFingerprint?: string;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}

export interface RequestProtectedPromotionResult {
  readonly approvalRequestId: ReturnType<typeof approvalRequestId.generate>;
  readonly operationId?: OperationId;
  readonly impactReviewFingerprint: string;
  readonly supersededApprovalRequestIds: readonly ReturnType<typeof approvalRequestId.brand>[];
  readonly draftVersionIds: readonly SecretVersionId[];
}
