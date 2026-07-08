import { APPROVAL_ERROR_CODES, environmentId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertImpactReviewFresh } from "../src/assert-impact-review-fresh.js";
import { computeImpactReviewFingerprint } from "../src/compute-impact-review-fingerprint.js";

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

  it("includes secret ids and provider sync extension when provided", () => {
    const fingerprint = computeImpactReviewFingerprint({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      draftVersionIds: ["sv_00000000000000000000000001" as never],
      secretIds: [
        "sec_00000000000000000000000002" as never,
        "sec_00000000000000000000000001" as never,
      ],
      providerSyncImpactFingerprint: "sha256:provider-plan-v1",
    });

    expect(fingerprint).toBe(
      `sha256:${ORG}|${PROJECT}|${ENV}|sv_00000000000000000000000001|sec_00000000000000000000000001|sec_00000000000000000000000002|sha256:provider-plan-v1`,
    );
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
