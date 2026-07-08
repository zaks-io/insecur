import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  assertMetadataOnlyEnvelopeShape,
  assertMetadataOnlyValue,
  errorEnvelope,
  isBinaryPayload,
  MetadataEnvelopeValidationError,
  successEnvelope,
} from "./envelopes.js";
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

  it("rejects top-level forbidden keys via assertMetadataOnlyEnvelopeShape", () => {
    expect(() => {
      assertMetadataOnlyEnvelopeShape({
        ok: true,
        data: { value: "must-not-appear" },
      });
    }).toThrow(MetadataEnvelopeValidationError);

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

  it("rejects nested forbidden keys in data and meta", () => {
    expect(() => {
      assertMetadataOnlyEnvelopeShape({
        ok: true,
        data: {
          organizationId: "org_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
          nested: { value: "must-not-appear" },
        },
      });
    }).toThrow(/forbidden key: value/);

    expect(() => {
      assertMetadataOnlyEnvelopeShape({
        ok: true,
        data: {},
        meta: {
          resolvedTargets: [
            {
              type: "environment",
              id: "env_01JZ8E3W4C8M2H6N9P1Q3R5T7V",
              parent: { type: "project", id: "prj_01JZ8E3A0K7J5T9Q2R4S6V8W0X", secret: "nope" },
            },
          ],
        },
      });
    }).toThrow(/forbidden key: secret/);

    expect(() => {
      assertMetadataOnlyEnvelopeShape({
        ok: false,
        error: {
          code: "auth.insufficient_scope",
          message: "denied",
          retryable: false,
        },
        meta: {
          details: [{ nested: { token: "must-not-appear" } }],
        },
      });
    }).toThrow(/forbidden key: token/);
  });

  it("rejects forbidden keys when building envelopes", () => {
    expect(() => {
      successEnvelope({ nested: { value: "must-not-appear" } });
    }).toThrow(/forbidden key: value/);

    expect(() => {
      errorEnvelope(
        {
          code: "secret.empty_value",
          message: "empty",
          retryable: false,
        },
        { meta: { wrappedValue: "nope" } as never },
      );
    }).toThrow(/forbidden key: wrappedValue/);
  });

  it("accepts remediation argv arrays and approval URLs", () => {
    const failure = errorEnvelope(
      {
        code: "auth.high_assurance_required",
        message: "Human approval required.",
        retryable: false,
      },
      {
        meta: { operationId: "op_01JZ8E2QYQ6M7F4K9A2B3C4D5E" as never },
        remediation: {
          approvalUrl: "https://app.insecur.cloud/orgs/org_test/approvals/op_test",
          poll: ["insecur", "operations", "wait", "op_test", "--json"],
          resume: ["insecur", "secrets", "promote", "--operation", "op_test"],
        },
      },
    );
    expect(failure.remediation?.poll).toEqual([
      "insecur",
      "operations",
      "wait",
      "op_test",
      "--json",
    ]);
    assertMetadataOnlyEnvelopeShape(failure as unknown as Record<string, unknown>);
  });

  it("rejects package seam byte field names (valueUtf8, plaintextUtf8)", () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(() => {
      successEnvelope({ valueUtf8: bytes });
    }).toThrow(/forbidden key: valueUtf8/);

    expect(() => {
      successEnvelope({ organizationId: "org_01JZ8E2QYQ6M7F4K9A2B3C4D5E", plaintextUtf8: bytes });
    }).toThrow(/forbidden key: plaintextUtf8/);

    expect(() => {
      assertMetadataOnlyEnvelopeShape({
        ok: true,
        data: {
          result: {
            nested: { valueUtf8: bytes },
          },
        },
      });
    }).toThrow(/forbidden key: valueUtf8/);

    expect(() => {
      assertMetadataOnlyEnvelopeShape({
        ok: true,
        data: {},
        meta: {
          details: [{ plaintextUtf8: bytes }],
        },
      });
    }).toThrow(/forbidden key: plaintextUtf8/);
  });

  it("rejects binary payloads at any depth", () => {
    const bytes = new Uint8Array([1, 2, 3]);

    expect(isBinaryPayload(bytes)).toBe(true);
    expect(isBinaryPayload(new ArrayBuffer(8))).toBe(true);
    expect(isBinaryPayload(new DataView(new ArrayBuffer(8)))).toBe(true);
    expect(isBinaryPayload(Buffer.from("secret"))).toBe(true);

    expect(() => {
      successEnvelope(bytes);
    }).toThrow(/forbidden binary payload/);

    expect(() => {
      successEnvelope({ organizationId: "org_01JZ8E2QYQ6M7F4K9A2B3C4D5E", payload: bytes });
    }).toThrow(/forbidden binary payload/);

    expect(() => {
      assertMetadataOnlyValue({
        items: [{ label: "ok", nested: { raw: bytes } }],
      });
    }).toThrow(/forbidden binary payload/);

    expect(() => {
      assertMetadataOnlyEnvelopeShape({
        ok: true,
        data: { wrapped: { bytes: new ArrayBuffer(4) } },
      });
    }).toThrow(/forbidden binary payload/);
  });

  it("rejects non-finite numbers (NaN, Infinity)", () => {
    for (const nonFinite of [Number.NaN, Infinity, -Infinity]) {
      expect(() => {
        successEnvelope({ count: nonFinite });
      }).toThrow(/unsupported value: non-finite number/);

      expect(() => {
        assertMetadataOnlyEnvelopeShape({
          ok: true,
          data: { nested: { count: nonFinite } },
        });
      }).toThrow(/unsupported value: non-finite number/);
    }

    expect(successEnvelope({ count: 0, ratio: 1.5 })).toMatchObject({ ok: true });
  });
});
