import type { UserActorRef } from "@insecur/access";
import {
  type ApprovalRequestId,
  type EnvironmentId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import { TenantApprovalRequestStore, type TenantScopedDb } from "@insecur/tenant-store";

import { hashCommentMetadata } from "./hash-comment-metadata.js";

export interface PersistRollbackApprovalRequestInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly actorUserId: UserActorRef["userId"];
  readonly approvalRequestId: ApprovalRequestId;
  readonly impactReviewFingerprint: string;
  readonly comment?: string;
  readonly secretId: SecretId;
  readonly toVersionNumber: number;
  readonly newSecretVersionId: SecretVersionId;
  readonly operationId?: OperationId;
}

export async function persistRollbackApprovalRequestOnDb(
  db: TenantScopedDb,
  input: PersistRollbackApprovalRequestInput,
): Promise<void> {
  await new TenantApprovalRequestStore(db).createRollbackApprovalRequest({
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
  });
}
