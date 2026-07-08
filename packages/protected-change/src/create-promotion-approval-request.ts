import type { UserActorRef } from "@insecur/access";
import { recordApprovalAudit } from "@insecur/audit";
import {
  approvalRequestId,
  type EnvironmentId,
  type OpaqueResourceId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
} from "@insecur/domain";
import {
  TenantApprovalRequestStore,
  withTenantScope,
  type PromotionDraftVersionTarget,
} from "@insecur/tenant-store";

import { hashCommentMetadata } from "./hash-comment-metadata.js";

async function persistPromotionApprovalRequest(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actorUserId: UserActorRef["userId"];
  readonly approvalRequestId: ReturnType<typeof approvalRequestId.generate>;
  readonly impactReviewFingerprint: string;
  readonly comment?: string;
  readonly validatedTargets: readonly PromotionDraftVersionTarget[];
  readonly operationId?: OperationId;
}): Promise<readonly ReturnType<typeof approvalRequestId.brand>[]> {
  return withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async ({ db }) => {
      const store = new TenantApprovalRequestStore(db);
      const superseded = await store.supersedePendingPromotionRequests({
        organizationId: input.organizationId,
        environmentId: input.environmentId,
        supersededByRequestId: input.approvalRequestId,
      });
      await store.createPromotionApprovalRequest({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        requesterUserId: input.actorUserId,
        approvalRequestId: input.approvalRequestId,
        impactReviewFingerprint: input.impactReviewFingerprint,
        ...hashCommentMetadata(input.comment),
        draftVersions: input.validatedTargets,
        ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
      });
      return superseded;
    },
  );
}

export async function createPromotionApprovalRequest(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly validatedTargets: readonly PromotionDraftVersionTarget[];
  readonly impactReviewFingerprint: string;
  readonly comment?: string;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}): Promise<{
  readonly approvalRequestId: ReturnType<typeof approvalRequestId.generate>;
  readonly supersededApprovalRequestIds: readonly ReturnType<typeof approvalRequestId.brand>[];
}> {
  const newApprovalRequestId = approvalRequestId.generate();
  const supersededApprovalRequestIds = await persistPromotionApprovalRequest({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    actorUserId: input.actor.userId,
    approvalRequestId: newApprovalRequestId,
    impactReviewFingerprint: input.impactReviewFingerprint,
    validatedTargets: input.validatedTargets,
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });

  await recordApprovalAudit({
    action: "request_created",
    outcome: "success",
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    resource: {
      type: "approval_request",
      id: newApprovalRequestId as unknown as OpaqueResourceId,
    },
    requestId: input.requestId,
  });

  return { approvalRequestId: newApprovalRequestId, supersededApprovalRequestIds };
}
