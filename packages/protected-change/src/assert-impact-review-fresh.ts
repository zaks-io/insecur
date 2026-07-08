import { APPROVAL_ERROR_CODES } from "@insecur/domain";

export function assertImpactReviewFresh(input: {
  readonly submittedFingerprint: string | undefined;
  readonly currentFingerprint: string;
}): void {
  if (
    input.submittedFingerprint !== undefined &&
    input.submittedFingerprint !== input.currentFingerprint
  ) {
    throw Object.assign(new Error("Approval Impact Review is stale."), {
      code: APPROVAL_ERROR_CODES.reviewStale,
    });
  }
}
