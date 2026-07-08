import { describe, expect, it } from "vitest";
import { parseImpactReview } from "./approval-request-impact-parse.js";

describe("parseImpactReview", () => {
  it("parses metadata-only draft versions and delivery impact", () => {
    expect(
      parseImpactReview({
        fingerprintAtCreation: "fp-old",
        currentFingerprint: "fp-current",
        isStale: true,
        draftVersions: [
          {
            secretId: "sec_01JZ8E2QYQAAAAAAAAAAAAAAAA",
            secretVersionId: "ver_01JZ8E2QYQAAAAAAAAAAAAAAAA",
            valueByteLength: 32,
            encodingClass: "utf8",
            secretShapeMatchVerdict: "match",
          },
        ],
        delivery: {
          runtimeInjectionPolicies: [
            {
              policyId: "pol_01JZ8E2QYQAAAAAAAAAAAAAAAA",
              activeVersionId: "ver_01JZ8E2QYQAAAAAAAAAAAAAAAA",
              commandFingerprint: "cmd-fp",
              deliveryMode: "env",
              ttlSeconds: 300,
              secretIds: ["sec_01JZ8E2QYQAAAAAAAAAAAAAAAA"],
            },
          ],
          providerSyncImpact: ["cloudflare_workers"],
        },
      }),
    ).toMatchObject({
      currentFingerprint: "fp-current",
      isStale: true,
      draftVersions: [{ valueByteLength: 32 }],
      delivery: {
        runtimeInjectionPolicies: [{ deliveryMode: "env" }],
        providerSyncImpact: ["cloudflare_workers"],
      },
    });
  });

  it("fails closed on malformed impact evidence", () => {
    expect(parseImpactReview({ isStale: "yes" })).toBeNull();
  });
});
