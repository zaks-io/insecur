import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  INSTANCE_ROOT_KEY_BYTE_LENGTH,
  parseInstanceRootKeyHex,
  tryParseInstanceRootKeyHex,
} from "../../src/root-key-material.js";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function expectRejectedRootKeyHex(raw: string): void {
  expect(() => parseInstanceRootKeyHex(raw)).toThrow();
  expect(tryParseInstanceRootKeyHex(raw)).toBeUndefined();
}

describe("instance root key material fuzz", () => {
  it("parses arbitrary 32-byte hex root keys exactly", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({
          minLength: INSTANCE_ROOT_KEY_BYTE_LENGTH,
          maxLength: INSTANCE_ROOT_KEY_BYTE_LENGTH,
        }),
        (bytes) => {
          const hex = bytesToHex(bytes);

          expect(parseInstanceRootKeyHex(hex)).toEqual(bytes);
          expect(parseInstanceRootKeyHex(hex.toUpperCase())).toEqual(bytes);
        },
      ),
      {
        examples: [
          [Uint8Array.from({ length: INSTANCE_ROOT_KEY_BYTE_LENGTH }, () => 0)],
          [Uint8Array.from({ length: INSTANCE_ROOT_KEY_BYTE_LENGTH }, () => 255)],
        ],
      },
    );
  });

  it("only accepts trimmed 64-character hex strings", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 96 }), (raw) => {
        const trimmed = raw.trim();
        const valid = /^[0-9a-fA-F]{64}$/u.test(trimmed);

        if (valid) {
          expect(parseInstanceRootKeyHex(raw)).toHaveLength(INSTANCE_ROOT_KEY_BYTE_LENGTH);
          expect(tryParseInstanceRootKeyHex(raw)).toHaveLength(INSTANCE_ROOT_KEY_BYTE_LENGTH);
          return;
        }

        expectRejectedRootKeyHex(raw);
      }),
      {
        examples: [
          [""],
          ["00".repeat(INSTANCE_ROOT_KEY_BYTE_LENGTH)],
          [` ${"ab".repeat(INSTANCE_ROOT_KEY_BYTE_LENGTH)} `],
          ["0".repeat(63)],
          ["0".repeat(65)],
          ["g".repeat(64)],
        ],
      },
    );
  });
});
