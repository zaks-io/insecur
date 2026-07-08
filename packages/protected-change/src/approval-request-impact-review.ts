import type { ApprovalRequestId, OrganizationId } from "@insecur/domain";
import { TenantApprovalRequestStore, withTenantScope } from "@insecur/tenant-store";
import type { PromotionDraftVersionTarget } from "@insecur/tenant-store";

import { assertImpactReviewFresh } from "./assert-impact-review-fresh.js";
import { computeImpactReviewFingerprint } from "./compute-impact-review-fingerprint.js";
import { loadApprovalImpactReviewState } from "./load-approval-impact-review-state.js";
import type { ApprovalRequestDetailRow } from "@insecur/tenant-store";

export async function loadDraftTargetsForRequest(input: {
  readonly organizationId: OrganizationId;
  readonly approvalRequestId: ApprovalRequestId;
}): Promise<readonly PromotionDraftVersionTarget[]> {
  return withTenantScope({ kind: "organization", organizationId: input.organizationId }, ({ db }) =>
    new TenantApprovalRequestStore(db).getDraftVersionsForRequest(input),
  );
}

export async function resolveCurrentImpactFingerprint(input: {
  readonly organizationId: OrganizationId;
  readonly row: ApprovalRequestDetailRow;
  readonly draftTargets: readonly PromotionDraftVersionTarget[];
}): Promise<string> {
  const impactReviewState = await loadApprovalImpactReviewState({
    organizationId: input.organizationId,
    projectId: input.row.projectId,
    environmentId: input.row.environmentId,
    draftTargets: input.draftTargets,
  });
  return computeImpactReviewFingerprint(impactReviewState);
}

export function isImpactReviewStale(input: {
  readonly submittedFingerprint: string | null | undefined;
  readonly currentFingerprint: string;
}): boolean {
  try {
    assertImpactReviewFresh({
      submittedFingerprint: input.submittedFingerprint ?? undefined,
      currentFingerprint: input.currentFingerprint,
    });
    return false;
  } catch {
    return true;
  }
}
