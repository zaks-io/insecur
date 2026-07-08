import type { ActorRef, AuthorizeScopeDeps } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
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
  type ApprovalRequestRequester,
  type PromotionDraftVersionTarget,
} from "@insecur/tenant-store";

import { authorizeApprovalRequestCreate } from "./authorize-approval-request-create.js";
import { createApprovalRequestWithAudit } from "./create-approval-request-with-audit.js";
import { hashCommentMetadata } from "./hash-comment-metadata.js";
import { recordSupersededApprovalRequestAudits } from "./record-superseded-approval-request-audit.js";

async function persistPromotionApprovalRequest(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requester: ApprovalRequestRequester;
  readonly approvalRequestId: ApprovalRequestId;
  readonly impactReviewFingerprint: string;
  readonly comment?: string;
  readonly validatedTargets: readonly PromotionDraftVersionTarget[];
  readonly operationId?: OperationId;
}): Promise<readonly ReturnType<typeof approvalRequestId.brand>[]> {
  const commentMetadata = await hashCommentMetadata(input.comment);
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
        requester: input.requester,
        approvalRequestId: input.approvalRequestId,
        impactReviewFingerprint: input.impactReviewFingerprint,
        ...commentMetadata,
        draftVersions: input.validatedTargets,
        ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
      });
      return superseded;
    },
  );
}

export async function createPromotionApprovalRequest(input: {
  readonly actor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly isProtectedEnvironment: boolean;
  readonly validatedTargets: readonly PromotionDraftVersionTarget[];
  readonly impactReviewFingerprint: string;
  readonly comment?: string;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly deps?: AuthorizeScopeDeps;
}): Promise<{
  readonly approvalRequestId: ApprovalRequestId;
  readonly supersededApprovalRequestIds: readonly ReturnType<typeof approvalRequestId.brand>[];
}> {
  const requester = await authorizeApprovalRequestCreate(input);

  const { approvalRequestId: newApprovalRequestId, result: supersededApprovalRequestIds } =
    await createApprovalRequestWithAudit({
      audit: {
        auditActor: input.auditActor,
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
          requester,
          approvalRequestId: createdApprovalRequestId,
          impactReviewFingerprint: input.impactReviewFingerprint,
          validatedTargets: input.validatedTargets,
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
          ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
        }),
    });

  if (supersededApprovalRequestIds.length > 0) {
    await recordSupersededApprovalRequestAudits({
      auditActor: input.auditActor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      supersededApprovalRequestIds,
      requestId: input.requestId,
    });
  }

  return { approvalRequestId: newApprovalRequestId, supersededApprovalRequestIds };
}
