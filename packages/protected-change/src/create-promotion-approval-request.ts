import type { ActorRef } from "@insecur/access";
import {
  approvalRequestId,
  type ApprovalRequestId,
  type EnvironmentId,
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

import { createApprovalRequestWithAudit } from "./create-approval-request-with-audit.js";
import { hashCommentMetadata } from "./hash-comment-metadata.js";
import { recordSupersededApprovalRequestAudits } from "./record-superseded-approval-request-audit.js";
import { requesterIdsFromActor } from "./requester-ids-from-actor.js";

async function persistPromotionApprovalRequest(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actor: ActorRef;
  readonly approvalRequestId: ApprovalRequestId;
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
        ...requesterIdsFromActor(input.actor),
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
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly validatedTargets: readonly PromotionDraftVersionTarget[];
  readonly impactReviewFingerprint: string;
  readonly comment?: string;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}): Promise<{
  readonly approvalRequestId: ApprovalRequestId;
  readonly supersededApprovalRequestIds: readonly ReturnType<typeof approvalRequestId.brand>[];
}> {
  const { approvalRequestId: newApprovalRequestId, result: supersededApprovalRequestIds } =
    await createApprovalRequestWithAudit({
      audit: {
        actor: input.actor,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        requestId: input.requestId,
      },
      persist: (createdApprovalRequestId) =>
        persistPromotionApprovalRequest({
          organizationId: input.organizationId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          actor: input.actor,
          approvalRequestId: createdApprovalRequestId,
          impactReviewFingerprint: input.impactReviewFingerprint,
          validatedTargets: input.validatedTargets,
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
          ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
        }),
    });

  if (supersededApprovalRequestIds.length > 0) {
    await recordSupersededApprovalRequestAudits({
      actor: input.actor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      supersededApprovalRequestIds,
      requestId: input.requestId,
    });
  }

  return { approvalRequestId: newApprovalRequestId, supersededApprovalRequestIds };
}
