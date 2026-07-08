import type { ApprovalImpactReviewState } from "./load-approval-impact-review-state.js";
import { sha256Hex } from "./sha256-hex.js";

function canonicalImpactReviewPayload(state: ApprovalImpactReviewState): string {
  return JSON.stringify({
    organizationId: state.organizationId,
    projectId: state.projectId,
    environmentId: state.environmentId,
    draftVersions: state.draftVersions,
    delivery: state.delivery,
    ...(state.providerSyncImpactFingerprint === undefined
      ? {}
      : { providerSyncImpactFingerprint: state.providerSyncImpactFingerprint }),
  });
}

/** Metadata-only fingerprint from server-generated delivery and draft impact facts (ADR-0017 / INS-85). */
export async function computeImpactReviewFingerprint(
  state: ApprovalImpactReviewState,
): Promise<string> {
  const digest = await sha256Hex(canonicalImpactReviewPayload(state));
  return `sha256:${digest}`;
}
