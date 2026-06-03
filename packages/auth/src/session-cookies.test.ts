import { describe, expect, it } from "vitest";
import {
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
});
