import type { ApprovalRequestId, OrganizationId } from "@insecur/domain";
import { TenantApprovalRequestStore, withTenantScope } from "@insecur/tenant-store";
import type { ActorRef } from "@insecur/access";

import {
  assertApprovalRequestPending,
  assertApprovalRequestReviewReadOrMaskNotFound,
} from "./approval-request-review-access.js";
import { approvalRequestNotFound } from "./approval-request-errors.js";
import type { ApprovalRequestReviewDetail } from "./approval-request-review-types.js";
import {
  isImpactReviewStale,
  loadDraftTargetsForRequest,
} from "./approval-request-impact-review.js";
import { computeImpactReviewFingerprint } from "./compute-impact-review-fingerprint.js";
import { loadApprovalImpactReviewState } from "./load-approval-impact-review-state.js";
import { toApprovalRequestReviewListItem } from "./to-approval-request-review-item.js";

export interface GetApprovalRequestReviewInput {
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
}

async function loadApprovalRequestRow(input: {
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
}) {
  const row = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantApprovalRequestStore(db).getApprovalRequestById({
        organizationId: input.organizationId,
        approvalRequestId: input.approvalRequestId,
      }),
  );
  if (row === null) {
    throw approvalRequestNotFound();
  }
  return row;
}

export async function getApprovalRequestReview(
  input: GetApprovalRequestReviewInput,
): Promise<ApprovalRequestReviewDetail> {
  const row = await loadApprovalRequestRow(input);

  await assertApprovalRequestReviewReadOrMaskNotFound({
    accessActor: input.actor,
    organizationId: input.organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
  });

  const draftTargets = await loadDraftTargetsForRequest({
    organizationId: input.organizationId,
    approvalRequestId: input.approvalRequestId,
  });
  const impactReviewState = await loadApprovalImpactReviewState({
    organizationId: input.organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
    draftTargets,
  });
  const currentFingerprint = await computeImpactReviewFingerprint(impactReviewState);

  return {
    ...toApprovalRequestReviewListItem(row),
    organizationId: input.organizationId,
    commentLength: row.commentLength,
    rollbackSecretId: row.rollbackSecretId,
    rollbackToVersionId: row.rollbackToVersionId,
    rollbackPromoteRequested: row.rollbackPromoteRequested,
    impactReview: {
      fingerprintAtCreation: row.impactReviewFingerprint,
      currentFingerprint,
      isStale: isImpactReviewStale({
        submittedFingerprint: row.impactReviewFingerprint,
        currentFingerprint,
      }),
      draftVersions: impactReviewState.draftVersions,
      delivery: impactReviewState.delivery,
    },
  };
}

export async function loadApprovalRequestForDecision(input: {
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
}) {
  const row = await loadApprovalRequestRow(input);
  assertApprovalRequestPending(row);
  return row;
}
