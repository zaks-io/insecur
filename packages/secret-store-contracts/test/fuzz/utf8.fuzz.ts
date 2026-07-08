import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { isValidUtf8 } from "../../src/is-valid-utf8.js";

function decodesWithFatalUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

describe("isValidUtf8 fuzz", () => {
  it("matches the platform fatal UTF-8 decoder for arbitrary byte arrays", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4096 }), (bytes) => {
        expect(isValidUtf8(bytes)).toBe(decodesWithFatalUtf8(bytes));
      }),
      {
        examples: [
          [Uint8Array.from([])],
          [Uint8Array.from([0x00])],
          [new TextEncoder().encode("hello")],
          [Uint8Array.from([0xc3, 0x28])],
          [Uint8Array.from([0xf0, 0x28, 0x8c, 0x28])],
        ],
      },
    );
  });
});
