import { describe, expect, it } from "vitest";

import { isUniqueConstraintViolation } from "../src/is-unique-constraint-violation.js";

describe("isUniqueConstraintViolation", () => {
  it("returns true for Postgres unique_violation (23505)", () => {
    expect(isUniqueConstraintViolation({ code: "23505" })).toBe(true);
  });

  it("returns false for other Postgres error codes", () => {
    expect(isUniqueConstraintViolation({ code: "23503" })).toBe(false);
  });

  it("returns false for non-object and null values", () => {
    expect(isUniqueConstraintViolation(null)).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
    expect(isUniqueConstraintViolation("23505")).toBe(false);
    expect(isUniqueConstraintViolation(23505)).toBe(false);
  });
});
