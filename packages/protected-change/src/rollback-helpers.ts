import {
  approvalRequestId,
  APPROVAL_ERROR_CODES,
  secretVersionId,
  type OrganizationId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import { copyRetainedSecretVersion, withTenantScope } from "@insecur/tenant-store";

import { computeImpactReviewFingerprint } from "./compute-impact-review-fingerprint.js";
import { createRollbackApprovalRequest } from "./create-rollback-approval-request.js";
import type { RequestProtectedRollbackInput } from "./request-protected-rollback-types.js";

export async function maybeCreateRollbackApprovalRequest(
  input: RequestProtectedRollbackInput,
  scope: {
    readonly organizationId: RequestProtectedRollbackInput["organizationId"];
    readonly projectId: RequestProtectedRollbackInput["projectId"];
    readonly environmentId: RequestProtectedRollbackInput["environmentId"];
  },
  newSecretVersionId: SecretVersionId,
  operationId?: RequestProtectedRollbackInput["operationId"],
): Promise<ReturnType<typeof approvalRequestId.generate> | undefined> {
  if (!input.promoteRequested) {
    return undefined;
  }

  return createRollbackApprovalRequest({
    actor: input.actor,
    ...scope,
    secretId: input.secretId,
    toVersionNumber: input.toVersionNumber,
    newSecretVersionId,
    impactReviewFingerprint: computeImpactReviewFingerprint({
      ...scope,
      draftVersionIds: [newSecretVersionId],
      secretIds: [input.secretId],
    }),
    requestId: input.requestId,
    ...(input.comment !== undefined ? { comment: input.comment } : {}),
    ...(operationId !== undefined ? { operationId } : {}),
  });
}

export async function copyRollbackVersion(input: {
  readonly organizationId: OrganizationId;
  readonly secretId: SecretId;
  readonly toVersionNumber: number;
  readonly newSecretVersionId: ReturnType<typeof secretVersionId.generate>;
  readonly asDraft: boolean;
}) {
  try {
    return await withTenantScope(
      { kind: "organization", organizationId: input.organizationId },
      ({ db }) =>
        copyRetainedSecretVersion(db, {
          organizationId: input.organizationId,
          secretId: input.secretId,
          toVersionNumber: input.toVersionNumber,
          newSecretVersionId: input.newSecretVersionId,
          asDraft: input.asDraft,
        }),
    );
  } catch {
    throw Object.assign(new Error("Rollback target is not eligible."), {
      code: APPROVAL_ERROR_CODES.rollbackTargetNotEligible,
    });
  }
}
