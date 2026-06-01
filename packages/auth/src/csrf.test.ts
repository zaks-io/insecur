import { describe, expect, it } from "vitest";
import { generateCsrfToken, validateCsrfToken } from "./csrf.js";

describe("validateCsrfToken", () => {
  it("accepts matching well-formed tokens", () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token, token)).toBe(true);
  });

  it("rejects mismatched well-formed tokens", () => {
    const cookie = generateCsrfToken();
    const header = generateCsrfToken();
    expect(validateCsrfToken(cookie, header)).toBe(false);
  });

  it("fails closed when either token is malformed base64url", () => {
    const valid = generateCsrfToken();
    expect(validateCsrfToken(valid, "not!!!valid")).toBe(false);
    expect(validateCsrfToken("not!!!valid", valid)).toBe(false);
    expect(validateCsrfToken("not!!!valid", "not!!!valid")).toBe(false);
  });
});
