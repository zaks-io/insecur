import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { canonicalJsonStringify } from "../../src/canonical-json.js";

describe("canonicalJsonStringify fuzz", () => {
  it("is stable after JSON parse/stringify normalization", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const canonical = canonicalJsonStringify(value);
        const parsed = JSON.parse(canonical);

        expect(canonicalJsonStringify(parsed)).toBe(canonical);
      }),
      {
        examples: [
          [null],
          [true],
          [""],
          [{ b: 1, a: 2 }],
          [{ z: [{ y: 2, x: 1 }], a: { c: 3, b: 4 } }],
        ],
      },
    );
  });

  it("does not depend on object insertion order", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ maxLength: 24 }), fc.jsonValue(), { maxKeys: 16 }),
        (record) => {
          const entries = Object.entries(record);
          const reversed = Object.fromEntries([...entries].reverse());

          expect(canonicalJsonStringify(reversed)).toBe(canonicalJsonStringify(record));
        },
      ),
      { examples: [[{ b: 1, a: 2, "10": true, "2": false }]] },
    );
  });
});
