import { describe, expect, it } from "vitest";

import { includesExactBindingPatternMarker } from "../src/exact-binding-pattern.js";

describe("includesExactBindingPatternMarker", () => {
  it("detects wildcard and prefix pattern markers", () => {
    expect(includesExactBindingPatternMarker("sec_*")).toBe(true);
    expect(includesExactBindingPatternMarker("prefix:DATABASE_")).toBe(true);
    expect(includesExactBindingPatternMarker("DATABASE_URL")).toBe(false);
  });
});
