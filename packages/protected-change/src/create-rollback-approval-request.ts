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

export interface PersistRollbackApprovalRequestInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requester: ApprovalRequestRequester;
  readonly approvalRequestId: ApprovalRequestId;
  readonly impactReviewFingerprint: string;
  readonly comment?: string;
  readonly secretId: SecretId;
  readonly toVersionId: SecretVersionId;
  readonly newSecretVersionId: SecretVersionId;
  readonly operationId?: OperationId;
}

/**
 * Inserts the rollback Approval Request row on an already-open tenant-scoped connection so the
 * emergency-rollback flow can copy the retained Published Version and create its Approval Request
 * inside one transaction (ADR-0017: rollback always publishes through an Approval Request). The
 * caller authorizes the create with `authorizeApprovalRequestCreate` before opening the scope.
 */
export async function persistRollbackApprovalRequestOnDb(
  db: TenantScopedDb,
  input: PersistRollbackApprovalRequestInput,
): Promise<void> {
  const commentMetadata = await hashCommentMetadata(input.comment);
  await new TenantApprovalRequestStore(db).createRollbackApprovalRequest({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    requester: input.requester,
    approvalRequestId: input.approvalRequestId,
    impactReviewFingerprint: input.impactReviewFingerprint,
    ...commentMetadata,
    secretId: input.secretId,
    toVersionId: input.toVersionId,
    promoteRequested: true,
    draftVersion: {
      secretId: input.secretId,
      secretVersionId: input.newSecretVersionId,
    },
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });
}

// Rollback deliberately does NOT supersede pending promotion Approval Requests: ADR-0017's
// "only one pending promotion per Protected Environment" rule is scoped to the promotion purpose
// (and enforced by the promotion-only partial unique index). A rollback is a distinct purpose and
// coexists with a pending promotion, so it neither supersedes nor is blocked by one.
async function persistRollbackApprovalRequest(
  input: PersistRollbackApprovalRequestInput,
): Promise<void> {
  await withTenantScope({ kind: "organization", organizationId: input.organizationId }, ({ db }) =>
    persistRollbackApprovalRequestOnDb(db, input),
  );
}

export interface CreateRollbackApprovalRequestInput {
  readonly actor: ActorRef;
  readonly auditActor: AuditActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly isProtectedEnvironment: boolean;
  readonly secretId: SecretId;
  readonly toVersionId: SecretVersionId;
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
        toVersionId: input.toVersionId,
        newSecretVersionId: input.newSecretVersionId,
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
        ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
      }),
  });

  return createdApprovalRequestId;
}
