import { describe, expect, it } from "vitest";

import { GCM_IV_LENGTH, RECORD_TYPE_SECRET, WRAPPED_DEK_LENGTH } from "../src/constants.js";
import { DecryptError } from "../src/errors.js";
import { parseEnvelopeLayout, writeEnvelopeHeader } from "../src/envelope-layout.js";

describe("parseEnvelopeLayout wrapped DEK length", () => {
  it("rejects envelopes whose wrapped DEK length header is not the fixed 48 bytes", () => {
    const header = writeEnvelopeHeader({
      recordType: RECORD_TYPE_SECRET,
      tenantDataKeyVersion: 1,
      dekWrapIv: new Uint8Array(GCM_IV_LENGTH),
      wrappedDekLength: WRAPPED_DEK_LENGTH - 1,
      valueIv: new Uint8Array(GCM_IV_LENGTH),
      valueCiphertextLength: 16,
    });
    const envelope = new Uint8Array(header.byteLength + (WRAPPED_DEK_LENGTH - 1) + 16);
    envelope.set(header, 0);

    expect(() => parseEnvelopeLayout(envelope, RECORD_TYPE_SECRET)).toThrow(DecryptError);
  });
});
