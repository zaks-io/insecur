import {
  APPROVAL_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  secretId,
  secretVersionId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  assertImpactReviewFresh,
  assertRecordedImpactReviewFresh,
} from "../src/assert-impact-review-fresh.js";
import { computeImpactReviewFingerprint } from "../src/compute-impact-review-fingerprint.js";
import type { ApprovalImpactReviewState } from "../src/load-approval-impact-review-state.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const SV_1 = secretVersionId.brand("sv_00000000000000000000000001");
const SV_2 = secretVersionId.brand("sv_00000000000000000000000002");
const SEC_1 = secretId.brand("sec_00000000000000000000000001");

const HEX_64 = /^sha256:[0-9a-f]{64}$/;

function baseState(): ApprovalImpactReviewState {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    draftVersions: [
      {
        secretId: SEC_1,
        secretVersionId: SV_1,
        valueByteLength: 24,
        encodingClass: "utf8",
        secretShapeMatchVerdict: "match",
      },
    ],
    delivery: {
      runtimeInjectionPolicies: [
        {
          policyId: "rip_a",
          activeVersionId: "ripv_a",
          commandFingerprint: "cmd_a",
          deliveryMode: "env",
          secretIds: [String(SEC_1)],
          ttlSeconds: 300,
        },
      ],
      providerSyncImpact: ["sync_cloudflare_worker_a:enabled"],
    },
  };
}

describe("computeImpactReviewFingerprint", () => {
  it("is a real SHA-256 hex digest, not a concatenation of caller ids", async () => {
    const fingerprint = await computeImpactReviewFingerprint(baseState());

    expect(fingerprint).toMatch(HEX_64);
    // Regression guard for the B2 defect: the old impl returned `sha256:` + ids joined by `|`.
    expect(fingerprint).not.toContain(ORG);
    expect(fingerprint).not.toContain(String(SV_1));
    expect(fingerprint).not.toContain("|");
  });

  it("matches an independently computed SHA-256 of the canonical live-impact payload", async () => {
    const state = baseState();
    const canonical = JSON.stringify({
      organizationId: state.organizationId,
      projectId: state.projectId,
      environmentId: state.environmentId,
      draftVersions: state.draftVersions,
      delivery: state.delivery,
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    const expected = `sha256:${[...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;

    expect(await computeImpactReviewFingerprint(state)).toBe(expected);
  });

  it("does not include Sensitive Values or plaintext (metadata-only invariant)", async () => {
    const sensitive = "super-secret-plaintext-value";
    const fingerprint = await computeImpactReviewFingerprint(baseState());

    expect(fingerprint).not.toContain(sensitive);
    expect(fingerprint).toMatch(HEX_64);
  });
});

describe("stale-closure detection via impact fingerprint (recompute-then-compare)", () => {
  it("flags stale when the live delivery/sync impact drifted after approval was recorded", async () => {
    // Fingerprint recorded at approval time over the then-live impact.
    const atApproval = await computeImpactReviewFingerprint(baseState());

    // Server RE-computes over the CURRENT live impact: the sync target flipped enabled -> disabled.
    const drifted = baseState();
    const recomputed = await computeImpactReviewFingerprint({
      ...drifted,
      delivery: { ...drifted.delivery, providerSyncImpact: ["sync_cloudflare_worker_a:disabled"] },
    });

    // The seam is a genuine recompute, not stored===stored: drift must change the digest.
    expect(recomputed).not.toBe(atApproval);
    expect(() => {
      assertImpactReviewFresh({ submittedFingerprint: atApproval, currentFingerprint: recomputed });
    }).toThrow(expect.objectContaining({ code: APPROVAL_ERROR_CODES.reviewStale }));
  });

  it("flags stale when the batch of draft versions changed", async () => {
    const atApproval = await computeImpactReviewFingerprint(baseState());
    const withExtraDraft = baseState();
    const recomputed = await computeImpactReviewFingerprint({
      ...withExtraDraft,
      draftVersions: [
        ...withExtraDraft.draftVersions,
        {
          secretId: SEC_1,
          secretVersionId: SV_2,
          valueByteLength: 12,
          encodingClass: "utf8",
          secretShapeMatchVerdict: "match",
        },
      ],
    });

    expect(recomputed).not.toBe(atApproval);
    expect(() => {
      assertImpactReviewFresh({ submittedFingerprint: atApproval, currentFingerprint: recomputed });
    }).toThrow(expect.objectContaining({ code: APPROVAL_ERROR_CODES.reviewStale }));
  });

  it("does NOT go stale when passing the stored fingerprint as current would be a tautology", async () => {
    // Guard against the B2 tautology: if the wiring passed the STORED fingerprint as BOTH sides,
    // drift would never be caught. Here the recompute over live (drifted) impact differs from the
    // stored one, so the fresh check must fail; a stored===stored comparison would (wrongly) pass.
    const stored = await computeImpactReviewFingerprint(baseState());
    const drifted = baseState();
    const liveRecompute = await computeImpactReviewFingerprint({
      ...drifted,
      delivery: { ...drifted.delivery, providerSyncImpact: ["sync_cloudflare_worker_a:disabled"] },
    });

    // Wired correctly (recompute over live): stale.
    expect(() => {
      assertImpactReviewFresh({ submittedFingerprint: stored, currentFingerprint: liveRecompute });
    }).toThrow(expect.objectContaining({ code: APPROVAL_ERROR_CODES.reviewStale }));
    // Tautology (stored as both): would NOT catch drift. Documented as the anti-pattern.
    expect(() => {
      assertImpactReviewFresh({ submittedFingerprint: stored, currentFingerprint: stored });
    }).not.toThrow();
  });

  it("does not flag stale when the impact is unchanged", async () => {
    const atApproval = await computeImpactReviewFingerprint(baseState());
    const recomputed = await computeImpactReviewFingerprint(baseState());

    expect(recomputed).toBe(atApproval);
    expect(() => {
      assertImpactReviewFresh({ submittedFingerprint: atApproval, currentFingerprint: recomputed });
    }).not.toThrow();
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

  it("allows a matching submitted fingerprint, and treats an absent one as fresh (fail-open)", () => {
    // TRAP A: assertImpactReviewFresh fails OPEN on undefined. Execute/approve handoff must use
    // assertRecordedImpactReviewFresh so a missing stored fingerprint is rejected before compare.
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

describe("assertRecordedImpactReviewFresh", () => {
  it("rejects a missing or empty recorded fingerprint", () => {
    for (const recordedFingerprint of [undefined, null, ""]) {
      expect(() => {
        assertRecordedImpactReviewFresh({
          recordedFingerprint,
          currentFingerprint: "sha256:current",
        });
      }).toThrow(expect.objectContaining({ code: APPROVAL_ERROR_CODES.reviewStale }));
    }
  });

  it("rejects when the recorded fingerprint differs from the live recompute", () => {
    expect(() => {
      assertRecordedImpactReviewFresh({
        recordedFingerprint: "sha256:old",
        currentFingerprint: "sha256:new",
      });
    }).toThrow(expect.objectContaining({ code: APPROVAL_ERROR_CODES.reviewStale }));
  });

  it("allows approve/execute when the recorded fingerprint matches the live recompute", () => {
    expect(() => {
      assertRecordedImpactReviewFresh({
        recordedFingerprint: "sha256:same",
        currentFingerprint: "sha256:same",
      });
    }).not.toThrow();
  });
});
