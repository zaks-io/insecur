import { describe, expect, it } from "vitest";
import { assertMetadataOnlyEnvelopeShape, errorEnvelope, successEnvelope } from "./envelopes.js";
import { organizationId, requestId } from "./resource-ids.js";

describe("metadata envelopes", () => {
  it("builds success and error shapes without sensitive fields", () => {
    const org = organizationId.brand("org_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
    const success = successEnvelope(
      { organizationId: org },
      {
        requestId: requestId.brand("req_01JZ8E2QYQ6M7F4K9A2B3C4D5E"),
      },
    );
    expect(success).toMatchObject({
      ok: true,
      data: { organizationId: org },
    });

    const failure = errorEnvelope({
      code: "auth.insufficient_scope",
      message: "Missing required permission.",
      retryable: false,
    });
    expect(failure).toMatchObject({
      ok: false,
      error: {
        code: "auth.insufficient_scope",
        retryable: false,
      },
    });
  });

  it("rejects envelopes that carry forbidden sensitive keys", () => {
    expect(() => {
      assertMetadataOnlyEnvelopeShape({
        ok: true,
        data: { value: "must-not-appear" },
      });
    }).toThrow(/forbidden key: value/);

    expect(() => {
      assertMetadataOnlyEnvelopeShape({
        ok: false,
        error: {
          code: "secret.empty_value",
          message: "x",
          retryable: false,
          plaintext: "nope",
        },
      });
    }).toThrow(/forbidden key: plaintext/);
  });
});
