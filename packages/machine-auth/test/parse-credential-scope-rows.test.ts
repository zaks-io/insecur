import { CREDENTIAL_SCOPES } from "@insecur/access";
import { describe, expect, it } from "vitest";

import { parseCredentialScopeRows } from "../src/parse-credential-scope-rows.js";

describe("parseCredentialScopeRows", () => {
  it("parses protected issuance as a deploy-key credential scope", () => {
    expect(
      parseCredentialScopeRows([
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssueProtected,
      ]),
    ).toEqual([
      CREDENTIAL_SCOPES.runtimeInjectionRun,
      CREDENTIAL_SCOPES.runtimeInjectionGrantIssueProtected,
    ]);
  });

  it("rejects unknown credential scopes", () => {
    expect(parseCredentialScopeRows([CREDENTIAL_SCOPES.runtimeInjectionRun, "not-a-scope"])).toBe(
      null,
    );
  });
});
