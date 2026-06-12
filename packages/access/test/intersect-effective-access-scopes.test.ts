import {
  AUTHORIZATION_SCOPES,
  CREDENTIAL_SCOPES,
  intersectEffectiveAccessScopes,
  filterMachineForbiddenScopes,
  isMachineForbiddenAuthorizationScope,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

describe("intersectEffectiveAccessScopes", () => {
  const membershipScopes = [
    AUTHORIZATION_SCOPES.runtimeInjectionRun,
    AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
    AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
    AUTHORIZATION_SCOPES.secretNonProtectedWrite,
    AUTHORIZATION_SCOPES.approvalApprove,
  ] as const;

  const tokenBoundScopes = [
    AUTHORIZATION_SCOPES.runtimeInjectionRun,
    AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
    AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
  ] as const;

  const credentialScopes = [
    CREDENTIAL_SCOPES.runtimeInjectionRun,
    CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
  ] as const;

  it("returns the intersection of membership, token-bound, and credential scopes", () => {
    expect(
      intersectEffectiveAccessScopes(membershipScopes, tokenBoundScopes, credentialScopes),
    ).toEqual([
      AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
      AUTHORIZATION_SCOPES.runtimeInjectionRun,
    ]);
  });

  it("returns empty scopes when token-bound scopes do not cover the coordinate", () => {
    expect(intersectEffectiveAccessScopes(membershipScopes, [], credentialScopes)).toEqual([]);
  });

  it("strips machine-forbidden scopes even when present on membership grants", () => {
    const scopes = intersectEffectiveAccessScopes(
      membershipScopes,
      membershipScopes,
      membershipScopes,
    );

    expect(scopes).not.toContain(AUTHORIZATION_SCOPES.approvalApprove);
    expect(scopes).toContain(AUTHORIZATION_SCOPES.runtimeInjectionRun);
  });
});

describe("machine forbidden scopes", () => {
  it("identifies approval, metadata detail, and protected configuration scopes as forbidden", () => {
    expect(isMachineForbiddenAuthorizationScope(AUTHORIZATION_SCOPES.approvalApprove)).toBe(true);
    expect(isMachineForbiddenAuthorizationScope(AUTHORIZATION_SCOPES.approvalReject)).toBe(true);
    expect(isMachineForbiddenAuthorizationScope(AUTHORIZATION_SCOPES.projectConfigure)).toBe(true);
    expect(isMachineForbiddenAuthorizationScope(AUTHORIZATION_SCOPES.metadataDetailRead)).toBe(
      true,
    );
    expect(isMachineForbiddenAuthorizationScope(AUTHORIZATION_SCOPES.runtimeInjectionRun)).toBe(
      false,
    );
  });

  it("filters forbidden scopes from resolved machine access", () => {
    expect(
      filterMachineForbiddenScopes([
        AUTHORIZATION_SCOPES.runtimeInjectionRun,
        AUTHORIZATION_SCOPES.membershipManage,
      ]),
    ).toEqual([AUTHORIZATION_SCOPES.runtimeInjectionRun]);
  });
});
