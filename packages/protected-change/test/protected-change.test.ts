import {
  APPROVAL_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  VALIDATION_ERROR_CODES,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertImpactReviewFresh } from "../src/assert-impact-review-fresh.js";
import { computeImpactReviewFingerprint } from "../src/compute-impact-review-fingerprint.js";
import { hashCommentMetadata } from "../src/hash-comment-metadata.js";
import { parsePromoteDraftSelection } from "../src/parse-promote-draft-selection.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

describe("computeImpactReviewFingerprint", () => {
  it("sorts draft version ids deterministically", () => {
    const fingerprint = computeImpactReviewFingerprint({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      draftVersionIds: [
        "sv_00000000000000000000000002" as never,
        "sv_00000000000000000000000001" as never,
      ],
    });

    expect(fingerprint).toBe(
      `sha256:${ORG}|${PROJECT}|${ENV}|sv_00000000000000000000000001|sv_00000000000000000000000002`,
    );
  });
});

import { noopHighAssuranceDenied } from "../src/noop-high-assurance-denied.js";

describe("noopHighAssuranceDenied", () => {
  it("resolves without rethrowing", async () => {
    await expect(
      noopHighAssuranceDenied({ name: "HighAssuranceChallengeError" } as never),
    ).resolves.toBeUndefined();
  });
});

describe("hashCommentMetadata", () => {
  it("returns empty metadata for absent comments", () => {
    expect(hashCommentMetadata(undefined)).toEqual({});
    expect(hashCommentMetadata("")).toEqual({});
  });

  it("returns length and digest metadata for comments", () => {
    expect(hashCommentMetadata("promote")).toEqual({
      commentLength: 7,
      commentSha256: "sha256:7",
    });
  });
});

describe("parsePromoteDraftSelection", () => {
  it("rejects empty draft version lists", () => {
    expect(() => parsePromoteDraftSelection([])).toThrow(
      expect.objectContaining({ code: VALIDATION_ERROR_CODES.invalidCommandInput }),
    );
  });

  it("rejects invalid draft version id prefixes", () => {
    expect(() => parsePromoteDraftSelection(["sec_not_a_version"])).toThrow(
      expect.objectContaining({ code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId }),
    );
  });

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
