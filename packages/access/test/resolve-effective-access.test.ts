import {
  AUTHORIZATION_SCOPES,
  EffectiveAccessMemo,
  EffectiveAccessRequestCache,
  expandBuiltInRolePresetToScopes,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  resolveEffectiveAccessBatch,
  unionEffectiveAccessScopes,
  type LoadMembershipsFn,
  type MembershipRow,
} from "../src/index.js";
import { membershipId, organizationId, projectId, userId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

const ORG_A = organizationId.brand("org_00000000000000000000000001");
const ORG_B = organizationId.brand("org_00000000000000000000000002");
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

function syntheticProjectId(index: number): ReturnType<typeof projectId.brand> {
  const body = index.toString(16).toUpperCase().padStart(26, "0");
  return projectId.brand(`prj_${body}`);
}

function coordinateForProject(project: ReturnType<typeof projectId.brand>) {
  return { organizationId: ORG_A, projectId: project };
}

describe("resolveEffectiveAccess", () => {
  it("resolves First Value owner scopes from organization-tier membership", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      membership({ rolePreset: "owner" }),
    ]);

    const result = await resolveEffectiveAccess(
      ACTOR,
      { organizationId: ORG_A, projectId: PROJECT_A },
      { loadMemberships },
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
    expect(loadMemberships).toHaveBeenCalledWith({
      actor: ACTOR,
      organizationId: ORG_A,
      projectIds: [PROJECT_A],
    });
  });

  it("returns no scopes for a user without applicable memberships", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => []);

    const result = await resolveEffectiveAccess(
      OUTSIDER,
      { organizationId: ORG_A, projectId: PROJECT_A },
      { loadMemberships },
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

    await resolveEffectiveAccess(ACTOR, coordinate, { loadMemberships, memo });
    await resolveEffectiveAccess(ACTOR, coordinate, { loadMemberships, memo });

    expect(loadMemberships).toHaveBeenCalledTimes(1);
  });

  it("does not treat unknown role presets as authorization shortcuts", () => {
    expect(expandBuiltInRolePresetToScopes("owner")).not.toEqual([]);
    expect(expandBuiltInRolePresetToScopes("custom-role")).toEqual([]);
  });

  it("returns no scopes when a fake loader injects another organization owner membership", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      {
        membershipId: MEMBERSHIP_A,
        organizationId: ORG_B,
        projectId: null,
        userId: ACTOR.userId,
        rolePreset: "owner",
      },
    ]);

    const result = await resolveEffectiveAccess(
      ACTOR,
      { organizationId: ORG_A, projectId: PROJECT_A },
      { loadMemberships },
    );

    expect(result.scopes).toEqual([]);
  });

  it("returns no scopes when a fake loader injects another organization project membership", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      {
        membershipId: MEMBERSHIP_A,
        organizationId: ORG_B,
        projectId: PROJECT_A,
        userId: ACTOR.userId,
        rolePreset: "developer",
      },
    ]);

    const result = await resolveEffectiveAccess(
      ACTOR,
      { organizationId: ORG_A, projectId: PROJECT_A },
      { loadMemberships },
    );

    expect(result.scopes).toEqual([]);
  });
});

describe("resolveEffectiveAccessBatch", () => {
  it("loads memberships once for one project coordinate and once for fifty", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      membership({ rolePreset: "owner" }),
    ]);

    const oneProject = [coordinateForProject(syntheticProjectId(1))];
    await resolveEffectiveAccessBatch(ACTOR, oneProject, { loadMemberships });
    expect(loadMemberships).toHaveBeenCalledTimes(1);

    vi.mocked(loadMemberships).mockClear();

    const fiftyProjects = Array.from({ length: 50 }, (_, index) =>
      coordinateForProject(syntheticProjectId(index + 1)),
    );
    const results = await resolveEffectiveAccessBatch(ACTOR, fiftyProjects, {
      loadMemberships,
    });

    expect(results).toHaveLength(50);
    expect(loadMemberships).toHaveBeenCalledTimes(1);
    expect(loadMemberships).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ACTOR,
        organizationId: ORG_A,
        projectIds: expect.arrayContaining([syntheticProjectId(1), syntheticProjectId(50)]),
      }),
    );
    expect(vi.mocked(loadMemberships).mock.calls[0]?.[0].projectIds).toHaveLength(50);
  });

  it("deduplicates membership store reads through EffectiveAccessRequestCache", async () => {
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      membership({ rolePreset: "owner" }),
    ]);
    const requestCache = new EffectiveAccessRequestCache();

    await resolveEffectiveAccessBatch(ACTOR, [coordinateForProject(syntheticProjectId(1))], {
      loadMemberships,
      requestCache,
    });
    await resolveEffectiveAccessBatch(
      ACTOR,
      [coordinateForProject(syntheticProjectId(1)), coordinateForProject(syntheticProjectId(2))],
      { loadMemberships, requestCache },
    );

    expect(loadMemberships).toHaveBeenCalledTimes(2);
    expect(requestCache.membershipLoadCount()).toBe(2);
  });
});
