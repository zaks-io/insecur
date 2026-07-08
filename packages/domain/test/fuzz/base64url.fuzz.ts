import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { base64UrlToBytes, bytesToBase64Url } from "../../src/base64url.js";

const BASE64URL_ALPHABET_PATTERN = /^[A-Za-z0-9_-]*$/u;

const BYTE_EXAMPLES = [
  Uint8Array.from([]),
  Uint8Array.from([0]),
  Uint8Array.from([255]),
  Uint8Array.from([0, 255, 127, 128]),
] as const;

describe("base64url fuzz", () => {
  it("round-trips canonical encodings for arbitrary byte arrays", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4096 }), (bytes) => {
        const encoded = bytesToBase64Url(bytes);

        expect(encoded).toMatch(BASE64URL_ALPHABET_PATTERN);
        expect(encoded).not.toContain("=");
        expect(base64UrlToBytes(encoded)).toEqual(bytes);
      }),
      { examples: BYTE_EXAMPLES.map((bytes) => [bytes]) },
    );
  });

  it("fails closed for malformed alphabet or impossible base64url length", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 128 }), (value) => {
        const decoded = base64UrlToBytes(value);
        const hasInvalidAlphabet = !BASE64URL_ALPHABET_PATTERN.test(value);
        const hasImpossibleLength = value.length % 4 === 1;

        if (hasInvalidAlphabet || hasImpossibleLength) {
          expect(decoded).toBeNull();
        }
      }),
      { examples: [["="], ["A"], ["*"], ["abc="], ["hello world"]] },
    );
  });
});
