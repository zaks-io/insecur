import { describe, expect, it } from "vitest";

import { GCM_IV_LENGTH, RECORD_TYPE_SECRET, WRAPPED_DEK_LENGTH } from "../src/constants.js";
import { checkStoredEnvelopeBindingReadiness } from "../src/envelope-binding-readiness.js";
import { writeEnvelopeHeader } from "../src/envelope-layout.js";

function sampleEnvelope(tenantDataKeyVersion: number): Uint8Array {
  const header = writeEnvelopeHeader({
    recordType: RECORD_TYPE_SECRET,
    tenantDataKeyVersion,
    dekWrapIv: new Uint8Array(GCM_IV_LENGTH),
    wrappedDekLength: WRAPPED_DEK_LENGTH,
    valueIv: new Uint8Array(GCM_IV_LENGTH),
    valueCiphertextLength: 16,
  });
  const envelope = new Uint8Array(header.byteLength + WRAPPED_DEK_LENGTH + 16);
  envelope.set(header, 0);
  return envelope;
}

describe("checkStoredEnvelopeBindingReadiness", () => {
  it("passes when the header tenant data key version matches", () => {
    const report = checkStoredEnvelopeBindingReadiness({
      recordType: RECORD_TYPE_SECRET,
      envelopeBytes: sampleEnvelope(2),
      expectedTenantDataKeyVersion: 2,
    });

    expect(report.status).toBe("ready");
    expect(report.issues).toEqual([]);
    expect(report.tenantDataKeyVersion).toBe(2);
  });

  it("blocks when the header tenant data key version mismatches", () => {
    const report = checkStoredEnvelopeBindingReadiness({
      recordType: RECORD_TYPE_SECRET,
      envelopeBytes: sampleEnvelope(1),
      expectedTenantDataKeyVersion: 2,
    });

    expect(report.status).toBe("not_ready");
    expect(report.issues).toContainEqual({ code: "envelope.key_version_mismatch" });
  });

  it("blocks when the envelope layout is invalid", () => {
    const report = checkStoredEnvelopeBindingReadiness({
      recordType: RECORD_TYPE_SECRET,
      envelopeBytes: new Uint8Array([0, 1, 2]),
      expectedTenantDataKeyVersion: 1,
    });

    expect(report.status).toBe("not_ready");
    expect(report.issues).toContainEqual({ code: "envelope.layout_invalid" });
  });
});
