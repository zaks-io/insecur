import { describe, expect, it } from "vitest";
import { buildAncestryKey } from "../src/ancestry.js";

describe("buildAncestryKey", () => {
  it("returns the stable parent process id shared by harness child invocations", () => {
    expect(buildAncestryKey()).toBe(String(process.ppid));
  });
});
