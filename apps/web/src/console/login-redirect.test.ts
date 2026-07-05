import { describe, expect, it } from "vitest";
import { loginRedirectHref } from "./login-redirect.js";

describe("loginRedirectHref", () => {
  it("carries the requested console location to /login", () => {
    expect(loginRedirectHref("/orgs/org_01/audit")).toBe(
      "/login?returnTo=%2Forgs%2Forg_01%2Faudit",
    );
  });

  it("URL-encodes query strings in the return target", () => {
    expect(loginRedirectHref("/orgs/org_01?x=1")).toBe("/login?returnTo=%2Forgs%2Forg_01%3Fx%3D1");
  });
});
