import {
  APPROVAL_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  secretId,
  secretVersionId,
} from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertImpactReviewFresh } from "../src/assert-impact-review-fresh.js";
import {
  computeImpactReviewFingerprint,
  type ImpactReviewFingerprintInput,
} from "../src/compute-impact-review-fingerprint.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const SV_1 = secretVersionId.brand("sv_00000000000000000000000001");
const SV_2 = secretVersionId.brand("sv_00000000000000000000000002");
const SEC_1 = secretId.brand("sec_00000000000000000000000001");

const HEX_64 = /^sha256:[0-9a-f]{64}$/;

function baseInput(): ImpactReviewFingerprintInput {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    draftVersionIds: [SV_1, SV_2],
    secretIds: [SEC_1],
    deliveryImpacts: [{ targetId: "sync_cloudflare_worker_a", state: "enabled" }],
  };
}

describe("computeImpactReviewFingerprint", () => {
  it("is a real SHA-256 hex digest, not a concatenation of caller ids", async () => {
    const fingerprint = await computeImpactReviewFingerprint(baseInput());

    expect(fingerprint).toMatch(HEX_64);
    // Regression guard for the B2 defect: the old impl returned `sha256:` + ids joined by `|`.
    expect(fingerprint).not.toContain(ORG);
    expect(fingerprint).not.toContain(String(SV_1));
    expect(fingerprint).not.toContain("|");
  });

  it("matches an independently computed SHA-256 of the canonical impact inputs", async () => {
    const canonical = JSON.stringify({
      version: 1,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      draftVersionIds: [String(SV_1), String(SV_2)],
      publishedVersionIds: [],
      secretIds: [String(SEC_1)],
      deliveryImpacts: [{ targetId: "sync_cloudflare_worker_a", state: "enabled" }],
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
    const expected = `sha256:${[...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;

    expect(await computeImpactReviewFingerprint(baseInput())).toBe(expected);
  });

  it("is order-independent for draft versions and delivery impacts", async () => {
    const forward = await computeImpactReviewFingerprint(baseInput());
    const reordered = await computeImpactReviewFingerprint({
      ...baseInput(),
      draftVersionIds: [SV_2, SV_1],
      deliveryImpacts: [{ targetId: "sync_cloudflare_worker_a", state: "enabled" }],
    });

    expect(reordered).toBe(forward);
  });

  it("does not include Sensitive Values or plaintext (metadata-only invariant)", async () => {
    const sensitive = "super-secret-plaintext-value";
    // The API surface has no field to carry a Sensitive Value; the digest is opaque and never
    // echoes plaintext back regardless of what metadata identifiers contain.
    const fingerprint = await computeImpactReviewFingerprint({
      ...baseInput(),
      deliveryImpacts: [{ targetId: "sync_target_a", state: "enabled" }],
    });

    expect(fingerprint).not.toContain(sensitive);
    expect(fingerprint).toMatch(HEX_64);
  });
});

describe("stale-closure detection via impact fingerprint", () => {
  it("flags stale when the delivery/sync impact changed (drift detected)", async () => {
    const atApproval = await computeImpactReviewFingerprint(baseInput());
    // Underlying impact drifts: the sync target became disabled after approval was recorded.
    const recomputed = await computeImpactReviewFingerprint({
      ...baseInput(),
      deliveryImpacts: [{ targetId: "sync_cloudflare_worker_a", state: "disabled" }],
    });

    expect(recomputed).not.toBe(atApproval);
    expect(() => {
      assertImpactReviewFresh({
        submittedFingerprint: atApproval,
        currentFingerprint: recomputed,
      });
    }).toThrow(expect.objectContaining({ code: APPROVAL_ERROR_CODES.reviewStale }));
  });

  it("flags stale when the batch of draft versions changed", async () => {
    const atApproval = await computeImpactReviewFingerprint(baseInput());
    const recomputed = await computeImpactReviewFingerprint({
      ...baseInput(),
      draftVersionIds: [SV_1],
    });

    expect(recomputed).not.toBe(atApproval);
    expect(() => {
      assertImpactReviewFresh({
        submittedFingerprint: atApproval,
        currentFingerprint: recomputed,
      });
    }).toThrow(expect.objectContaining({ code: APPROVAL_ERROR_CODES.reviewStale }));
  });

  it("does not flag stale when the impact is unchanged", async () => {
    const atApproval = await computeImpactReviewFingerprint(baseInput());
    const recomputed = await computeImpactReviewFingerprint(baseInput());

    expect(recomputed).toBe(atApproval);
    expect(() => {
      assertImpactReviewFresh({
        submittedFingerprint: atApproval,
        currentFingerprint: recomputed,
      });
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
