import { SECRET_ERROR_CODES, bytesToBase64Url } from "@insecur/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { computeSecretWriteDescriptiveVerdicts } from "../../src/secret-write-descriptive-verdicts.js";
import { SecretWriteError } from "../../src/secret-write-error.js";
import { validateTextSecretValue } from "../../src/validate-text-secret-value.js";

const textEncoder = new TextEncoder();

function isValidFatalUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

describe("secret write verdict fuzz", () => {
  it("reports byte length, empty state, and JSON-safe non-revealing fields for arbitrary text", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2048 }), (value) => {
        const bytes = textEncoder.encode(value);
        const verdicts = computeSecretWriteDescriptiveVerdicts({ valueUtf8: bytes });
        const serialized = JSON.stringify(verdicts);

        expect(verdicts.valueByteLength).toBe(bytes.byteLength);
        expect(verdicts.isEmpty).toBe(bytes.byteLength === 0);
        expect(Object.keys(verdicts).sort()).toEqual([
          "encodingClass",
          "hasLeadingOrTrailingWhitespace",
          "isEmpty",
          "looksLikePlaceholder",
          "secretShapeMatchVerdict",
          "valueByteLength",
        ]);
        expect(serialized).not.toMatch(/digest|hash|checksum|similarity|prefix/iu);
      }),
      { examples: [[""], [" changeme "], ["café"], ["x".repeat(32)]] },
    );
  });

  it("matches random generation hints only when base64url-decoded byte length equals the hint", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 256 }), (bytes) => {
        const value = bytesToBase64Url(bytes);
        const verdicts = computeSecretWriteDescriptiveVerdicts({
          valueUtf8: textEncoder.encode(value),
          generationHint: `random:${bytes.byteLength}`,
        });

        expect(verdicts.secretShapeMatchVerdict).toBe("matches");
      }),
    );
  });

  it("validates only non-empty valid UTF-8 unless empty values are explicitly allowed", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 256 }), (bytes) => {
        if (!isValidFatalUtf8(bytes)) {
          expect(() => validateTextSecretValue(bytes)).toThrow(
            expect.objectContaining({ code: SECRET_ERROR_CODES.invalidEncoding }),
          );
          return;
        }

        if (bytes.byteLength === 0) {
          expect(() => validateTextSecretValue(bytes)).toThrow(SecretWriteError);
          expect(() => validateTextSecretValue(bytes, { allowEmpty: true })).not.toThrow();
          return;
        }

        expect(() => validateTextSecretValue(bytes)).not.toThrow();
      }),
    );
  });
});
