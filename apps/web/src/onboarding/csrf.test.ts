import { generateCsrfToken, INSECUR_CSRF_COOKIE } from "@insecur/auth";
import { describe, expect, it } from "vitest";
import { csrfTokenFromCookieHeader } from "./csrf.js";
import { isWizardMutationCsrfValid } from "./csrf-check.js";

describe("csrfTokenFromCookieHeader", () => {
  it("reads the CSRF cookie out of a Cookie header", () => {
    expect(csrfTokenFromCookieHeader(`a=1; ${INSECUR_CSRF_COOKIE}=tok_abc; b=2`)).toBe("tok_abc");
  });

  it("stays pinned to the @insecur/auth cookie name it deliberately duplicates", () => {
    // csrf.ts hardcodes the name so @insecur/auth stays out of the browser bundle; a cookie
    // rename in the auth package must fail here, not silently break every wizard mutation.
    expect(csrfTokenFromCookieHeader(`${INSECUR_CSRF_COOKIE}=pinned`)).toBe("pinned");
  });

  it.each([undefined, null, "", "other=1", `${INSECUR_CSRF_COOKIE}=`])(
    "returns undefined when the cookie is missing or empty: %j",
    (header) => {
      expect(csrfTokenFromCookieHeader(header)).toBeUndefined();
    },
  );

  it("fails closed on duplicate CSRF cookies regardless of order (INS-583)", () => {
    expect(
      csrfTokenFromCookieHeader(`${INSECUR_CSRF_COOKIE}=victim; ${INSECUR_CSRF_COOKIE}=attacker`),
    ).toBeUndefined();
    expect(
      csrfTokenFromCookieHeader(`${INSECUR_CSRF_COOKIE}=attacker; ${INSECUR_CSRF_COOKIE}=victim`),
    ).toBeUndefined();
  });

  it("ignores an unprefixed sibling-domain lookalike cookie", () => {
    expect(csrfTokenFromCookieHeader(`insecur_csrf=tossed; ${INSECUR_CSRF_COOKIE}=real`)).toBe(
      "real",
    );
  });
});

describe("isWizardMutationCsrfValid", () => {
  it("accepts the double-submit pair when cookie and payload token match", () => {
    const token = generateCsrfToken();
    expect(isWizardMutationCsrfValid(`${INSECUR_CSRF_COOKIE}=${token}`, token)).toBe(true);
  });

  it("rejects a mismatched token", () => {
    expect(
      isWizardMutationCsrfValid(
        `${INSECUR_CSRF_COOKIE}=${generateCsrfToken()}`,
        generateCsrfToken(),
      ),
    ).toBe(false);
  });

  it("fails closed without the cookie", () => {
    expect(isWizardMutationCsrfValid(null, generateCsrfToken())).toBe(false);
  });

  it("fails closed without a submitted token", () => {
    expect(
      isWizardMutationCsrfValid(`${INSECUR_CSRF_COOKIE}=${generateCsrfToken()}`, undefined),
    ).toBe(false);
    expect(isWizardMutationCsrfValid(`${INSECUR_CSRF_COOKIE}=${generateCsrfToken()}`, "")).toBe(
      false,
    );
  });

  it("fails closed when the CSRF cookie is duplicated (INS-583)", () => {
    const token = generateCsrfToken();
    expect(
      isWizardMutationCsrfValid(
        `${INSECUR_CSRF_COOKIE}=${token}; ${INSECUR_CSRF_COOKIE}=${token}`,
        token,
      ),
    ).toBe(false);
  });
});
