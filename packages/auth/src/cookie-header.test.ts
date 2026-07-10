import { describe, expect, it } from "vitest";
import { readSingleCookieValue } from "./cookie-header.js";
import { INSECUR_CSRF_COOKIE, WORKOS_SESSION_COOKIE } from "./constants.js";
import { parseRequestCredentials } from "./credentials.js";

describe("readSingleCookieValue", () => {
  it("reads a uniquely named cookie", () => {
    expect(readSingleCookieValue("a=1; target=value; b=2", "target")).toBe("value");
  });

  it.each([undefined, null, "", "other=1", "target="])(
    "returns undefined when the cookie is missing or empty: %j",
    (header) => {
      expect(readSingleCookieValue(header, "target")).toBeUndefined();
    },
  );

  it("fails closed on duplicate names regardless of header order (INS-583)", () => {
    expect(readSingleCookieValue("target=victim; target=attacker", "target")).toBeUndefined();
    expect(readSingleCookieValue("target=attacker; target=victim", "target")).toBeUndefined();
  });

  it("counts an empty-valued duplicate as ambiguous", () => {
    expect(readSingleCookieValue("target=; target=attacker", "target")).toBeUndefined();
  });

  it("matches the exact name only, never a prefixed or suffixed lookalike", () => {
    expect(readSingleCookieValue("target2=nope; xtarget=nope; target=yes", "target")).toBe("yes");
    expect(readSingleCookieValue("__Host-target=real; target=tossed", "__Host-target")).toBe(
      "real",
    );
  });
});

describe("parseRequestCredentials cookie handling", () => {
  it("fails closed when the session or CSRF cookie is duplicated (INS-583)", () => {
    const credentials = parseRequestCredentials({
      authorizationHeader: null,
      cookieHeader: [
        `${WORKOS_SESSION_COOKIE}=victim`,
        `${WORKOS_SESSION_COOKIE}=attacker`,
        `${INSECUR_CSRF_COOKIE}=victim`,
        `${INSECUR_CSRF_COOKIE}=attacker`,
      ].join("; "),
      csrfHeader: null,
    });
    expect(credentials.workosSealedSession).toBeUndefined();
    expect(credentials.csrfCookie).toBeUndefined();
  });

  it("ignores unprefixed sibling-domain lookalike cookies", () => {
    const credentials = parseRequestCredentials({
      authorizationHeader: null,
      cookieHeader: `wos-session=tossed; ${WORKOS_SESSION_COOKIE}=sealed; insecur_csrf=tossed; ${INSECUR_CSRF_COOKIE}=token`,
      csrfHeader: null,
    });
    expect(credentials.workosSealedSession).toBe("sealed");
    expect(credentials.csrfCookie).toBe("token");
  });
});
