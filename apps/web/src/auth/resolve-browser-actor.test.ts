import { describe, expect, it } from "vitest";
import { hasWorkosSessionCookie } from "./resolve-browser-actor.js";

describe("hasWorkosSessionCookie", () => {
  it("detects the WorkOS sealed session cookie", () => {
    const request = new Request("https://insecur.test/whoami", {
      headers: { Cookie: "wos-session=sealed; insecur_csrf=abc" },
    });
    expect(hasWorkosSessionCookie(request)).toBe(true);
  });

  it("returns false when the session cookie is absent", () => {
    const request = new Request("https://insecur.test/whoami");
    expect(hasWorkosSessionCookie(request)).toBe(false);
  });
});
