import { describe, expect, it } from "vitest";
import {
  formatEgressSweepHits,
  simulateEgressLeak,
  simulateRpcEgressLeak,
  sweepEgressSurfaces,
  type EgressCapture,
} from "./egress-sweep.js";
import { mintCanarySentinel, type SentinelEncoding } from "./sentinel-encodings.js";

function variantPattern(
  sentinel: ReturnType<typeof mintCanarySentinel>,
  encoding: SentinelEncoding,
) {
  const variant = sentinel.variants.find((entry) => entry.encoding === encoding);
  if (!variant) {
    throw new Error(`Missing sentinel variant for encoding ${encoding}`);
  }
  return variant.pattern;
}

describe("egress sweep", () => {
  it("allows base64url only at delivery.encodedValueUtf8", () => {
    const sentinel = mintCanarySentinel();
    const base64url = variantPattern(sentinel, "base64url");
    const capture: EgressCapture = {
      httpResponses: [
        {
          step: "consume",
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            ok: true,
            delivery: {
              grantId: "igr_ALLOWED",
              variableKey: "CANARY_OK",
              encodedValueUtf8: base64url,
            },
          }),
        },
      ],
      rpcDeliveryPayloadJson: JSON.stringify({
        ok: true,
        value: {
          ok: true,
          delivery: {
            grantId: "igr_ALLOWED",
            variableKey: "CANARY_OK",
            encodedValueUtf8: base64url,
          },
        },
      }),
    };

    expect(sweepEgressSurfaces(capture, sentinel)).toEqual([]);
  });

  it("allows base64url at value.delivery.encodedValueUtf8 in the Runtime RPC envelope", () => {
    const sentinel = mintCanarySentinel();
    const base64url = variantPattern(sentinel, "base64url");
    const capture: EgressCapture = {
      httpResponses: [],
      rpcDeliveryPayloadJson: JSON.stringify({
        ok: true,
        value: {
          ok: true,
          delivery: {
            grantId: "igr_ALLOWED",
            variableKey: "CANARY_OK",
            encodedValueUtf8: base64url,
          },
        },
      }),
    };

    expect(sweepEgressSurfaces(capture, sentinel)).toEqual([]);
  });

  it("flags top-level encodedValueUtf8 outside the delivery object", () => {
    const sentinel = mintCanarySentinel();
    const base64url = variantPattern(sentinel, "base64url");
    const capture: EgressCapture = {
      httpResponses: [
        {
          step: "consume",
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            ok: true,
            encodedValueUtf8: base64url,
          }),
        },
      ],
      rpcDeliveryPayloadJson: JSON.stringify({ ok: true }),
    };

    const hits = sweepEgressSurfaces(capture, sentinel);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      surface: "egress",
      location: "http.consume.body",
      jsonPath: "encodedValueUtf8",
      encoding: "base64url",
    });
  });

  it("flags top-level encodedValueUtf8 in the Runtime RPC envelope", () => {
    const sentinel = mintCanarySentinel();
    const base64url = variantPattern(sentinel, "base64url");
    const capture: EgressCapture = {
      httpResponses: [],
      rpcDeliveryPayloadJson: JSON.stringify({
        ok: true,
        value: {
          ok: true,
          encodedValueUtf8: base64url,
        },
      }),
    };

    const hits = sweepEgressSurfaces(capture, sentinel);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      surface: "egress",
      location: "rpc.delivery",
      jsonPath: "value.encodedValueUtf8",
      encoding: "base64url",
    });
  });

  it("flags base64url outside delivery.encodedValueUtf8", () => {
    const sentinel = mintCanarySentinel();
    const base64url = variantPattern(sentinel, "base64url");
    const capture: EgressCapture = {
      httpResponses: [
        {
          step: "consume",
          status: 200,
          headers: {},
          bodyText: JSON.stringify({
            ok: true,
            delivery: {
              grantId: "igr_ALLOWED",
              variableKey: "CANARY_OK",
              encodedValueUtf8: base64url,
            },
            debug: base64url,
          }),
        },
      ],
      rpcDeliveryPayloadJson: JSON.stringify({ ok: true }),
    };

    const hits = sweepEgressSurfaces(capture, sentinel);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      surface: "egress",
      location: "http.consume.body",
      jsonPath: "debug",
      encoding: "base64url",
    });
  });

  it("flags raw sentinel outside delivery.encodedValueUtf8", () => {
    const sentinel = mintCanarySentinel();
    const raw = variantPattern(sentinel, "raw");
    const capture: EgressCapture = {
      httpResponses: [
        {
          step: "issue",
          status: 200,
          headers: {},
          bodyText: JSON.stringify({ ok: true, data: { note: raw } }),
        },
      ],
      rpcDeliveryPayloadJson: JSON.stringify({ ok: true }),
    };

    const hits = sweepEgressSurfaces(capture, sentinel);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      surface: "egress",
      location: "http.issue.body",
      jsonPath: "data.note",
      encoding: "raw",
    });
    expect(formatEgressSweepHits(hits)).toContain("http.issue.body");
  });

  it("detects a deliberately planted plaintext sentinel in an unexpected HTTP response field (negative control)", () => {
    const sentinel = mintCanarySentinel();
    const { hits, rawHit } = simulateEgressLeak(sentinel);

    expect(rawHit).toBeDefined();
    expect(rawHit?.surface).toBe("egress");
    expect(rawHit?.location).toBe("http.consume.body");
    expect(rawHit?.jsonPath).toBe("debug");
    expect(rawHit?.encoding).toBe("raw");
    expect(hits.length).toBeGreaterThan(0);
  });

  it("detects a deliberately planted plaintext sentinel in an unexpected Runtime RPC field (negative control)", () => {
    const sentinel = mintCanarySentinel();
    const { hits, rawHit } = simulateRpcEgressLeak(sentinel);

    expect(rawHit).toBeDefined();
    expect(rawHit?.surface).toBe("egress");
    expect(rawHit?.location).toBe("rpc.delivery");
    expect(rawHit?.jsonPath).toBe("value.debug");
    expect(rawHit?.encoding).toBe("raw");
    expect(hits.length).toBeGreaterThan(0);
  });
});
