import { describe, expect, it } from "vitest";
import { buildAncestryKey } from "../src/ancestry.js";

describe("buildAncestryKey", () => {
  it("returns a stable parent:child pid key", () => {
    expect(buildAncestryKey()).toBe(`${String(process.ppid)}:${String(process.pid)}`);
  });
});
