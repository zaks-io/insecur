import { generateCsrfToken } from "@insecur/auth";
import { describe, expect, it } from "vitest";
import { csrfTokenFromCookieHeader } from "./csrf.js";
import { isWizardMutationCsrfValid } from "./csrf-check.js";

describe("csrfTokenFromCookieHeader", () => {
  it("reads the insecur_csrf cookie out of a Cookie header", () => {
    expect(csrfTokenFromCookieHeader("a=1; insecur_csrf=tok_abc; b=2")).toBe("tok_abc");
  });

  it.each([undefined, null, "", "other=1", "insecur_csrf="])(
    "returns undefined when the cookie is missing or empty: %j",
    (header) => {
      expect(csrfTokenFromCookieHeader(header)).toBeUndefined();
    },
  );
});

describe("isWizardMutationCsrfValid", () => {
  it("accepts the double-submit pair when cookie and payload token match", () => {
    const token = generateCsrfToken();
    expect(isWizardMutationCsrfValid(`insecur_csrf=${token}`, token)).toBe(true);
  });

  it("rejects a mismatched token", () => {
    expect(
      isWizardMutationCsrfValid(`insecur_csrf=${generateCsrfToken()}`, generateCsrfToken()),
    ).toBe(false);
  });

  it("fails closed without the cookie", () => {
    expect(isWizardMutationCsrfValid(null, generateCsrfToken())).toBe(false);
  });

  it("fails closed without a submitted token", () => {
    expect(isWizardMutationCsrfValid(`insecur_csrf=${generateCsrfToken()}`, undefined)).toBe(false);
    expect(isWizardMutationCsrfValid(`insecur_csrf=${generateCsrfToken()}`, "")).toBe(false);
  });
});
