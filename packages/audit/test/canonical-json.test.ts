import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "../src/canonical-json.js";

describe("canonicalJsonStringify", () => {
  it("sorts object keys deterministically", () => {
    expect(canonicalJsonStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("canonicalizes nested objects and arrays", () => {
    expect(
      canonicalJsonStringify({
        z: [{ y: 2, x: 1 }],
        a: { c: 3, b: 4 },
      }),
    ).toBe('{"a":{"b":4,"c":3},"z":[{"x":1,"y":2}]}');
  });
});
