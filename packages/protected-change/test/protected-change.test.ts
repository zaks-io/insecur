import { APPROVAL_ERROR_CODES, environmentId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertImpactReviewFresh } from "../src/assert-impact-review-fresh.js";
import { computeImpactReviewFingerprint } from "../src/compute-impact-review-fingerprint.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

const BASE_STATE = {
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  draftVersions: [
    {
      secretId: "sec_00000000000000000000000001" as never,
      secretVersionId: "sv_00000000000000000000000001" as never,
      valueByteLength: 12,
      encodingClass: "utf8",
      secretShapeMatchVerdict: "match",
    },
  ],
  delivery: {
    runtimeInjectionPolicies: [
      {
        policyId: "rip_00000000000000000000000001",
        activeVersionId: "riv_00000000000000000000000001",
        commandFingerprint: "sha256:cmd",
        deliveryMode: "env",
        secretIds: ["sec_00000000000000000000000001"],
        ttlSeconds: 300,
      },
    ],
    providerSyncImpact: [],
  },
} as const;

describe("computeImpactReviewFingerprint", () => {
  it("returns a stable sha256 fingerprint from server-side impact state", async () => {
    const fingerprint = await computeImpactReviewFingerprint(BASE_STATE);
    expect(fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    await expect(computeImpactReviewFingerprint(BASE_STATE)).resolves.toBe(fingerprint);
  });

  it("changes when delivery impact facts change", async () => {
    const baseline = await computeImpactReviewFingerprint(BASE_STATE);
    const changed = await computeImpactReviewFingerprint({
      ...BASE_STATE,
      delivery: {
        ...BASE_STATE.delivery,
        runtimeInjectionPolicies: [
          {
            ...BASE_STATE.delivery.runtimeInjectionPolicies[0],
            ttlSeconds: 600,
          },
        ],
      },
    });
    expect(changed).not.toBe(baseline);
  });

  it("includes provider sync extension when provided", async () => {
    const withoutProvider = await computeImpactReviewFingerprint(BASE_STATE);
    const withProvider = await computeImpactReviewFingerprint({
      ...BASE_STATE,
      providerSyncImpactFingerprint: "sha256:provider-plan-v1",
    });
    expect(withProvider).not.toBe(withoutProvider);
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
