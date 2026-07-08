import {
  APPROVAL_ERROR_CODES,
  secretVersionId,
  type ApprovalRequestId,
  type OrganizationId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import {
  copyRetainedSecretVersion,
  type CopyRetainedSecretVersionResult,
  withTenantScope,
  type TenantScopedDb,
} from "@insecur/tenant-store";

import { computeImpactReviewFingerprint } from "./compute-impact-review-fingerprint.js";
import { createApprovalRequestWithAudit } from "./create-approval-request-with-audit.js";
import { persistRollbackApprovalRequestOnDb } from "./create-rollback-approval-request.js";
import type { RequestProtectedRollbackInput } from "./request-protected-rollback-types.js";

export interface ExecuteProtectedRollbackPersistenceInput {
  readonly input: RequestProtectedRollbackInput;
  readonly scope: {
    readonly organizationId: RequestProtectedRollbackInput["organizationId"];
    readonly projectId: RequestProtectedRollbackInput["projectId"];
    readonly environmentId: RequestProtectedRollbackInput["environmentId"];
  };
  readonly newSecretVersionId: SecretVersionId;
  readonly operationId?: RequestProtectedRollbackInput["operationId"];
}

export type ExecuteProtectedRollbackPersistenceResult = CopyRetainedSecretVersionResult & {
  readonly approvalRequestId?: ApprovalRequestId;
};

export async function executeProtectedRollbackPersistence(
  params: ExecuteProtectedRollbackPersistenceInput,
): Promise<ExecuteProtectedRollbackPersistenceResult> {
  const { input, scope, newSecretVersionId, operationId } = params;

  if (!input.promoteRequested) {
    return copyRollbackVersion({
      organizationId: input.organizationId,
      secretId: input.secretId,
      toVersionNumber: input.toVersionNumber,
      newSecretVersionId,
      asDraft: false,
    });
  }

  const { approvalRequestId: createdApprovalRequestId, result: copied } =
    await persistRollbackWithApproval({
      input,
      scope,
      newSecretVersionId,
      ...(operationId !== undefined ? { operationId } : {}),
    });

  return { ...copied, approvalRequestId: createdApprovalRequestId };
}

async function persistRollbackWithApproval(input: {
  readonly input: RequestProtectedRollbackInput;
  readonly scope: ExecuteProtectedRollbackPersistenceInput["scope"];
  readonly newSecretVersionId: SecretVersionId;
  readonly operationId?: RequestProtectedRollbackInput["operationId"];
}): Promise<{
  readonly approvalRequestId: ApprovalRequestId;
  readonly result: CopyRetainedSecretVersionResult;
}> {
  const impactReviewFingerprint = computeImpactReviewFingerprint({
    ...input.scope,
    draftVersionIds: [input.newSecretVersionId],
    secretIds: [input.input.secretId],
  });

  return createApprovalRequestWithAudit({
    audit: {
      actor: input.input.actor,
      organizationId: input.input.organizationId,
      projectId: input.input.projectId,
      environmentId: input.input.environmentId,
      requestId: input.input.requestId,
    },
    persist: (createdApprovalRequestId) =>
      copyVersionAndCreateRollbackApproval({
        input: input.input,
        newSecretVersionId: input.newSecretVersionId,
        createdApprovalRequestId,
        impactReviewFingerprint,
        ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
      }),
  });
}

async function copyVersionAndCreateRollbackApproval(input: {
  readonly input: RequestProtectedRollbackInput;
  readonly newSecretVersionId: SecretVersionId;
  readonly createdApprovalRequestId: ApprovalRequestId;
  readonly impactReviewFingerprint: string;
  readonly operationId?: RequestProtectedRollbackInput["operationId"];
}): Promise<CopyRetainedSecretVersionResult> {
  return withTenantScope(
    { kind: "organization", organizationId: input.input.organizationId },
    async ({ db }) => {
      const copiedVersion = await copyRetainedSecretVersionOrThrow(db, {
        organizationId: input.input.organizationId,
        secretId: input.input.secretId,
        toVersionNumber: input.input.toVersionNumber,
        newSecretVersionId: input.newSecretVersionId,
        asDraft: true,
      });
      await persistRollbackApprovalRequestOnDb(db, {
        organizationId: input.input.organizationId,
        projectId: input.input.projectId,
        environmentId: input.input.environmentId,
        actorUserId: input.input.actor.userId,
        approvalRequestId: input.createdApprovalRequestId,
        impactReviewFingerprint: input.impactReviewFingerprint,
        secretId: input.input.secretId,
        toVersionNumber: input.input.toVersionNumber,
        newSecretVersionId: input.newSecretVersionId,
        ...(input.input.comment !== undefined ? { comment: input.input.comment } : {}),
        ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
      });
      return copiedVersion;
    },
  );
}

async function copyRetainedSecretVersionOrThrow(
  db: TenantScopedDb,
  input: Parameters<typeof copyRetainedSecretVersion>[1],
): Promise<CopyRetainedSecretVersionResult> {
  try {
    return await copyRetainedSecretVersion(db, input);
  } catch {
    throw Object.assign(new Error("Rollback target is not eligible."), {
      code: APPROVAL_ERROR_CODES.rollbackTargetNotEligible,
    });
  }
}

export async function copyRollbackVersion(input: {
  readonly organizationId: OrganizationId;
  readonly secretId: SecretId;
  readonly toVersionNumber: number;
  readonly newSecretVersionId: ReturnType<typeof secretVersionId.generate>;
  readonly asDraft: boolean;
}): Promise<CopyRetainedSecretVersionResult> {
  return withTenantScope({ kind: "organization", organizationId: input.organizationId }, ({ db }) =>
    copyRetainedSecretVersionOrThrow(db, {
      organizationId: input.organizationId,
      secretId: input.secretId,
      toVersionNumber: input.toVersionNumber,
      newSecretVersionId: input.newSecretVersionId,
      asDraft: input.asDraft,
    }),
  );
}
