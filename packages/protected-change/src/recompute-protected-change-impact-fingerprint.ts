import type { ProtectedChangeRecord } from "./protected-change-types.js";
import { computeImpactReviewFingerprint } from "./compute-impact-review-fingerprint.js";
import { loadApprovalImpactReviewState } from "./load-approval-impact-review-state.js";
import { validatePromotionDraftTargets } from "./validate-promotion-draft-targets.js";

/**
 * Recompute seam (ADR-0017 / INS-85 / INS-496): load CURRENT live delivery + draft impact for a
 * Protected Change and return the server-side Approval Impact Review Fingerprint. Callers pass the
 * result to `assertImpactReviewFresh` before approval or execution handoff.
 */
export async function recomputeProtectedChangeImpactFingerprint(
  record: ProtectedChangeRecord,
): Promise<string> {
  const draftTargets = await validatePromotionDraftTargets({
    organizationId: record.organizationId,
    environmentId: record.environmentId,
    draftVersionIds: record.draftVersionIds,
  });
  const impactReviewState = await loadApprovalImpactReviewState({
    organizationId: record.organizationId,
    projectId: record.projectId,
    environmentId: record.environmentId,
    draftTargets,
  });
  return computeImpactReviewFingerprint(impactReviewState);
}
