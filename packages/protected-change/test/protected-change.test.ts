import { APPROVAL_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertImpactReviewFresh } from "../src/assert-impact-review-fresh.js";
import { parsePromoteDraftSelection } from "../src/parse-promote-draft-selection.js";

describe("parsePromoteDraftSelection", () => {
  it("rejects wildcard and all-staged selection tokens", () => {
    for (const token of ["*", "all", "all-staged", "staged", "wildcard"]) {
      expect(() => parsePromoteDraftSelection([token])).toThrow(
        expect.objectContaining({ code: APPROVAL_ERROR_CODES.wildcardSelectionRejected }),
      );
    }
  });

  it("accepts exact draft version ids", () => {
    const result = parsePromoteDraftSelection([
      "sv_00000000000000000000000001",
      "sv_00000000000000000000000002",
    ]);
    expect(result.draftVersionIds).toHaveLength(2);
  });
});

describe("assertImpactReviewFresh", () => {
  it("throws approval.review_stale when submitted fingerprint differs", () => {
    expect(() => {
      assertImpactReviewFresh({
        submittedFingerprint: "sha256:old",
        currentFingerprint: "sha256:new",
      });
    }).toThrow(expect.objectContaining({ code: APPROVAL_ERROR_CODES.reviewStale }));
  });

  it("allows matching or absent submitted fingerprint", () => {
    expect(() => {
      assertImpactReviewFresh({
        submittedFingerprint: "sha256:same",
        currentFingerprint: "sha256:same",
      });
    }).not.toThrow();
    expect(() => {
      assertImpactReviewFresh({
        submittedFingerprint: undefined,
        currentFingerprint: "sha256:same",
      });
    }).not.toThrow();
  });
});
