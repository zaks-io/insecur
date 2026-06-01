import {
  AUTHORIZATION_SCOPES,
  EffectiveAccessMemo,
  expandBuiltInRolePresetToScopes,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  unionEffectiveAccessScopes,
  type LoadMembershipsFn,
  type MembershipRow,
} from "../src/index.js";
import { membershipId, organizationId, projectId, userId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

const ORG_A = organizationId.brand("org_00000000000000000000000001");
const PROJECT_A = projectId.brand("prj_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: userId.brand("usr_00000000000000000000000001") };
const OUTSIDER = {
  type: "user" as const,
  userId: userId.brand("usr_00000000000000000000000099"),
};

const MEMBERSHIP_A = membershipId.brand("mem_00000000000000000000000001");
const MEMBERSHIP_B = membershipId.brand("mem_00000000000000000000000002");

function membership(
  partial: Pick<MembershipRow, "rolePreset"> &
    Partial<Pick<MembershipRow, "projectId" | "membershipId">>,
): MembershipRow {
  return {
    membershipId: partial.membershipId ?? MEMBERSHIP_A,
    organizationId: ORG_A,
    projectId: partial.projectId ?? null,
    userId: ACTOR.userId,
    rolePreset: partial.rolePreset,
  };
}

describe("resolveEffectiveAccess", () => {
  it("resolves First Value owner scopes from organization-tier membership", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      membership({ rolePreset: "owner" }),
    ]);

    const result = await resolveEffectiveAccess(
      ACTOR,
      { organizationId: ORG_A, projectId: PROJECT_A },
      { deps: { loadMemberships } },
    );

    for (const scope of [
      AUTHORIZATION_SCOPES.onboardingGuidedProvision,
      AUTHORIZATION_SCOPES.secretNonProtectedWrite,
      AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
      AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
      AUTHORIZATION_SCOPES.runtimeInjectionRun,
    ]) {
      expect(hasAuthorizationScope(result, scope)).toBe(true);
    }
    expect(loadMemberships).toHaveBeenCalledTimes(1);
  });

  it("returns no scopes for a user without applicable memberships", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => []);

    const result = await resolveEffectiveAccess(
      OUTSIDER,
      { organizationId: ORG_A, projectId: PROJECT_A },
      { deps: { loadMemberships } },
    );

    expect(result.scopes).toEqual([]);
  });

  it("unions organization-tier and project-tier grants inside one organization", () => {
    const scopes = unionEffectiveAccessScopes([
      membership({ rolePreset: "owner", projectId: null }),
      membership({
        rolePreset: "developer",
        projectId: PROJECT_A,
        membershipId: MEMBERSHIP_B,
      }),
    ]);

    expect(scopes).toContain(AUTHORIZATION_SCOPES.onboardingGuidedProvision);
    expect(scopes).toContain(AUTHORIZATION_SCOPES.secretNonProtectedWrite);
    expect(scopes).toContain(AUTHORIZATION_SCOPES.runtimeInjectionRun);
  });

  it("memoizes within a request so repeated resolution uses one membership read", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      membership({ rolePreset: "owner" }),
    ]);
    const memo = new EffectiveAccessMemo();
    const coordinate = { organizationId: ORG_A, projectId: PROJECT_A };

    await resolveEffectiveAccess(ACTOR, coordinate, { deps: { loadMemberships, memo } });
    await resolveEffectiveAccess(ACTOR, coordinate, { deps: { loadMemberships, memo } });

    expect(loadMemberships).toHaveBeenCalledTimes(1);
  });

  it("issues one membership read regardless of how many scopes are checked afterward", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      membership({ rolePreset: "owner" }),
    ]);

    const result = await resolveEffectiveAccess(
      ACTOR,
      { organizationId: ORG_A, projectId: PROJECT_A },
      { deps: { loadMemberships } },
    );

    const checks = [
      AUTHORIZATION_SCOPES.onboardingGuidedProvision,
      AUTHORIZATION_SCOPES.secretNonProtectedWrite,
      AUTHORIZATION_SCOPES.runtimeInjectionRun,
      AUTHORIZATION_SCOPES.organizationRead,
    ];
    for (const scope of checks) {
      expect(hasAuthorizationScope(result, scope)).toBe(true);
    }
    expect(loadMemberships).toHaveBeenCalledTimes(1);
  });

  it("does not treat unknown role presets as authorization shortcuts", () => {
    expect(expandBuiltInRolePresetToScopes("owner")).not.toEqual([]);
    expect(expandBuiltInRolePresetToScopes("custom-role")).toEqual([]);
  });
});
