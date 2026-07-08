import { APPROVAL_ERROR_CODES } from "@insecur/domain";

function throwImpactReviewStale(): never {
  throw Object.assign(new Error("Approval Impact Review is stale."), {
    code: APPROVAL_ERROR_CODES.reviewStale,
  });
}

export function assertImpactReviewFresh(input: {
  readonly submittedFingerprint: string | undefined;
  readonly currentFingerprint: string;
}): void {
  if (
    input.submittedFingerprint !== undefined &&
    input.submittedFingerprint !== input.currentFingerprint
  ) {
    throwImpactReviewStale();
  }
}

/**
 * Fail-closed freshness gate for approval/execute handoff: the server-stored recorded fingerprint
 * must be present and must match a live recompute. Callers must pass the stored value from
 * approval evidence or the approval-request row — never a client-submitted fingerprint.
 */
export function assertRecordedImpactReviewFresh(input: {
  readonly recordedFingerprint: string | null | undefined;
  readonly currentFingerprint: string;
}): void {
  if (
    input.recordedFingerprint === undefined ||
    input.recordedFingerprint === null ||
    input.recordedFingerprint.length === 0
  ) {
    throwImpactReviewStale();
  }
  assertImpactReviewFresh({
    submittedFingerprint: input.recordedFingerprint,
    currentFingerprint: input.currentFingerprint,
  });
}
