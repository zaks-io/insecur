import { AUTHORIZATION_SCOPES, isAuthorizationScope } from "../src/authorization-scopes.js";
import { isCredentialScope } from "../src/credential-scopes.js";
import { describe, expect, it } from "vitest";

describe("AUTHORIZATION_SCOPES", () => {
  it("registers runtime_injection:grant_issue_protected as a known scope atom", () => {
    expect(AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected).toBe(
      "runtime_injection:grant_issue_protected",
    );
    expect(isAuthorizationScope(AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected)).toBe(
      true,
    );
    expect(isAuthorizationScope("runtime_injection:grant_issue_protected")).toBe(true);
    expect(isAuthorizationScope("not.a.real.scope")).toBe(false);
  });

  it("treats protected issuance as a machine credential scope for deploy keys", () => {
    expect(isCredentialScope(AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue)).toBe(true);
    expect(isCredentialScope(AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected)).toBe(true);
  });
});
