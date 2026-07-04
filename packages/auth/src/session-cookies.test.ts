import { describe, expect, it } from "vitest";
import {
  formatSessionClearCookie,
  formatSessionSetCookie,
  insecurCsrfCookieAttributes,
  workosSessionCookieAttributes,
} from "./session-cookies.js";

describe("session cookie attributes", () => {
  it("marks WorkOS session cookies HttpOnly and Secure", () => {
    const header = formatSessionSetCookie(workosSessionCookieAttributes, "sealed_value");
    expect(header).toContain("wos-session=sealed_value");
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
    expect(header).toContain("wos-session=");
    expect(header).toContain("Max-Age=0");
  });
});
