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
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import { TenantApprovalRequestStore, withTenantScope } from "@insecur/tenant-store";

import { hashCommentMetadata } from "./hash-comment-metadata.js";

async function persistRollbackApprovalRequest(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actorUserId: UserActorRef["userId"];
  readonly approvalRequestId: ReturnType<typeof approvalRequestId.generate>;
  readonly impactReviewFingerprint: string;
  readonly comment?: string;
  readonly secretId: SecretId;
  readonly toVersionNumber: number;
  readonly newSecretVersionId: SecretVersionId;
  readonly operationId?: OperationId;
}): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: input.organizationId }, ({ db }) =>
    new TenantApprovalRequestStore(db).createRollbackApprovalRequest({
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      requesterUserId: input.actorUserId,
      approvalRequestId: input.approvalRequestId,
      impactReviewFingerprint: input.impactReviewFingerprint,
      ...hashCommentMetadata(input.comment),
      secretId: input.secretId,
      toVersionNumber: input.toVersionNumber,
      promoteRequested: true,
      draftVersion: {
        secretId: input.secretId,
        secretVersionId: input.newSecretVersionId,
      },
      ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
    }),
  );
}

export async function createRollbackApprovalRequest(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly secretId: SecretId;
  readonly toVersionNumber: number;
  readonly newSecretVersionId: SecretVersionId;
  readonly impactReviewFingerprint: string;
  readonly comment?: string;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
}): Promise<ReturnType<typeof approvalRequestId.generate>> {
  const createdApprovalRequestId = approvalRequestId.generate();
  await persistRollbackApprovalRequest({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    actorUserId: input.actor.userId,
    approvalRequestId: createdApprovalRequestId,
    impactReviewFingerprint: input.impactReviewFingerprint,
    secretId: input.secretId,
    toVersionNumber: input.toVersionNumber,
    newSecretVersionId: input.newSecretVersionId,
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
      id: createdApprovalRequestId as unknown as OpaqueResourceId,
    },
    requestId: input.requestId,
  });

  return createdApprovalRequestId;
}
