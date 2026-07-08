import type { UserActorRef } from "@insecur/access";
import {
  type ApprovalRequestId,
  type EnvironmentId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
  type RequestId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import {
  TenantApprovalRequestStore,
  type TenantScopedDb,
  withTenantScope,
} from "@insecur/tenant-store";

import { createApprovalRequestWithAudit } from "./create-approval-request-with-audit.js";
import { hashCommentMetadata } from "./hash-comment-metadata.js";

interface PersistRollbackApprovalRequestInput {
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

async function persistRollbackApprovalRequestOnDb(
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

async function persistRollbackApprovalRequest(
  input: PersistRollbackApprovalRequestInput,
): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: input.organizationId }, ({ db }) =>
    persistRollbackApprovalRequestOnDb(db, input),
  );
}

export interface CreateRollbackApprovalRequestInput {
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
}

export async function createRollbackApprovalRequest(
  input: CreateRollbackApprovalRequestInput,
): Promise<ApprovalRequestId> {
  const { approvalRequestId: createdApprovalRequestId } = await createApprovalRequestWithAudit({
    audit: {
      actor: input.actor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      requestId: input.requestId,
    },
    persist: (createdRequestId) =>
      persistRollbackApprovalRequest({
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        actorUserId: input.actor.userId,
        approvalRequestId: createdRequestId,
        impactReviewFingerprint: input.impactReviewFingerprint,
        secretId: input.secretId,
        toVersionNumber: input.toVersionNumber,
        newSecretVersionId: input.newSecretVersionId,
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
        ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
      }),
  });

  return createdApprovalRequestId;
}
