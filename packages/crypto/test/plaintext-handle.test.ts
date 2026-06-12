import { describe, expect, it } from "vitest";

import { PlaintextHandle } from "../src/plaintext-handle.js";

describe("PlaintextHandle", () => {
  it("throws when JSON.stringify is called", () => {
    const handle = new PlaintextHandle(new TextEncoder().encode("runtime-value"));
    expect(() => JSON.stringify(handle)).toThrow(/PlaintextHandle must not be serialized/);
    expect(() => JSON.stringify({ value: handle })).toThrow(
      /PlaintextHandle must not be serialized/,
    );
  });

  it("unwraps to the original bytes at an egress point", () => {
    const bytes = new TextEncoder().encode("runtime-value");
    const handle = new PlaintextHandle(bytes);
    expect(handle.unwrapUtf8()).toBe(bytes);
  });
});
