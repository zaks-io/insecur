import type { ApprovalImpactReviewState } from "./load-approval-impact-review-state.js";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

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
