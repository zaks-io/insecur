import { describe, expect, it } from "vitest";
import { INSECUR_CSRF_COOKIE, WORKOS_SESSION_COOKIE } from "./constants.js";
import {
  formatSessionClearCookie,
  formatSessionSetCookie,
  insecurCsrfCookieAttributes,
  workosSessionCookieAttributes,
} from "./session-cookies.js";

describe("session cookie attributes", () => {
  it("marks WorkOS session cookies HttpOnly and Secure", () => {
    const header = formatSessionSetCookie(workosSessionCookieAttributes, "sealed_value");
    expect(header).toContain(`${WORKOS_SESSION_COOKIE}=sealed_value`);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
  });

  it("keeps CSRF cookies readable by the browser", () => {
    expect(insecurCsrfCookieAttributes.httpOnly).toBe(false);
    expect(insecurCsrfCookieAttributes.secure).toBe(true);
  });

  it("clears cookies with Max-Age=0", () => {
    const header = formatSessionClearCookie(workosSessionCookieAttributes);
    expect(header).toContain(`${WORKOS_SESSION_COOKIE}=`);
    expect(header).toContain("Max-Age=0");
  });

  it.each([
    ["session", workosSessionCookieAttributes],
    ["csrf", insecurCsrfCookieAttributes],
  ])("keeps the %s cookie host-only: __Host-, Secure, Path=/, no Domain (INS-583)", (_, attrs) => {
    expect(attrs.name.startsWith("__Host-")).toBe(true);
    for (const header of [
      formatSessionSetCookie(attrs, "value"),
      formatSessionClearCookie(attrs),
    ]) {
      expect(header).toContain("Secure");
      expect(header).toContain("Path=/");
      expect(header).not.toContain("Domain=");
    }
  });

  it("fails fast when a __Host- cookie is not Secure with Path=/", () => {
    expect(() =>
      formatSessionSetCookie({ ...workosSessionCookieAttributes, secure: false }, "value"),
    ).toThrow(/__Host-/);
    expect(() =>
      formatSessionClearCookie({ ...workosSessionCookieAttributes, path: "/x" }),
    ).toThrow(/__Host-/);
  });
});

describe("cookie name constants", () => {
  it("are __Host- prefixed so sibling domains cannot toss overriding variants", () => {
    expect(WORKOS_SESSION_COOKIE).toBe("__Host-wos-session");
    expect(INSECUR_CSRF_COOKIE).toBe("__Host-insecur_csrf");
  });
});
