import type { ActorRef, AuthorizeScopeDeps } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
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
  type ApprovalRequestRequester,
  type TenantScopedDb,
  withTenantScope,
} from "@insecur/tenant-store";

import { authorizeApprovalRequestCreate } from "./authorize-approval-request-create.js";
import { createApprovalRequestWithAudit } from "./create-approval-request-with-audit.js";
import { hashCommentMetadata } from "./hash-comment-metadata.js";

interface PersistRollbackApprovalRequestInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requester: ApprovalRequestRequester;
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
  commentMetadata: Awaited<ReturnType<typeof hashCommentMetadata>>,
): Promise<void> {
  await new TenantApprovalRequestStore(db).createRollbackApprovalRequest({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    requester: input.requester,
    approvalRequestId: input.approvalRequestId,
    impactReviewFingerprint: input.impactReviewFingerprint,
    ...commentMetadata,
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
  const commentMetadata = await hashCommentMetadata(input.comment);
  await withTenantScope({ kind: "organization", organizationId: input.organizationId }, ({ db }) =>
    persistRollbackApprovalRequestOnDb(db, input, commentMetadata),
  );
}

export interface CreateRollbackApprovalRequestInput {
  readonly actor: ActorRef;
  readonly auditActor: AuditActorRef;
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
  readonly deps?: AuthorizeScopeDeps;
}

export async function createRollbackApprovalRequest(
  input: CreateRollbackApprovalRequestInput,
): Promise<ApprovalRequestId> {
  const requester = await authorizeApprovalRequestCreate(input);

  const { approvalRequestId: createdApprovalRequestId } = await createApprovalRequestWithAudit({
    audit: {
      auditActor: input.auditActor,
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
        requester,
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
