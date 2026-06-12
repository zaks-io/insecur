import { describe, expect, it } from "vitest";
import { toIsoTimestamp } from "../src/parse-db-timestamp.js";

describe("toIsoTimestamp", () => {
  it("formats Date values", () => {
    const date = new Date("2026-01-15T12:34:56.789Z");
    expect(toIsoTimestamp(date)).toBe("2026-01-15T12:34:56.789Z");
  });

  it("formats Drizzle transparent-parser string values", () => {
    expect(toIsoTimestamp("2026-01-15 12:34:56.789+00")).toBe("2026-01-15T12:34:56.789Z");
  });
});
