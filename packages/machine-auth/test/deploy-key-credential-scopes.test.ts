import { CREDENTIAL_SCOPES, RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE } from "@insecur/access";
import { describe, expect, it } from "vitest";
import {
  DEPLOY_KEY_ALLOWED_CREDENTIAL_SCOPES,
  DEPLOY_KEY_FORBIDDEN_EXAMPLE_SCOPES,
  collectDeployKeyOverbroadCredentialScopes,
  isDeployKeyCredentialScopeBundle,
} from "../src/deploy-key-credential-scopes.js";

describe("deploy-key-credential-scopes", () => {
  it("allows the runtime injection credential bundle", () => {
    expect(isDeployKeyCredentialScopeBundle([...RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE])).toBe(
      true,
    );
    expect(
      collectDeployKeyOverbroadCredentialScopes(RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE),
    ).toEqual([]);
  });

  it("rejects secret write, secret read, and other broad scopes", () => {
    for (const scope of DEPLOY_KEY_FORBIDDEN_EXAMPLE_SCOPES) {
      expect(collectDeployKeyOverbroadCredentialScopes([scope])).toEqual([scope]);
    }

    expect(
      collectDeployKeyOverbroadCredentialScopes([
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.secretNonProtectedWrite,
      ]),
    ).toEqual([CREDENTIAL_SCOPES.secretNonProtectedWrite]);
  });

  it("pins the allowed deploy key bundle to runtime injection only", () => {
    expect(DEPLOY_KEY_ALLOWED_CREDENTIAL_SCOPES).toEqual(RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE);
  });

  it("allows protected issuance on deploy-key credentials", () => {
    expect(
      isDeployKeyCredentialScopeBundle([
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssueProtected,
      ]),
    ).toBe(true);
    expect(
      collectDeployKeyOverbroadCredentialScopes([
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssueProtected,
      ]),
    ).toEqual([]);
  });
});
