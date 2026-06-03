import {
  AUTHORIZATION_SCOPES,
  CREDENTIAL_SCOPES,
  RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE,
  hasAuthorizationScope,
  resolveEffectiveAccess,
  resolveEffectiveAccessBatch,
  type LoadMachineMembershipsFn,
  type MachineMembershipRow,
} from "../src/index.js";
import {
  environmentId,
  machineIdentityId,
  membershipId,
  organizationId,
  projectId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

const ORG_A = organizationId.brand("org_00000000000000000000000001");
const PROJECT_A = projectId.brand("prj_00000000000000000000000001");
const PROJECT_B = projectId.brand("prj_00000000000000000000000002");
const ENV_A = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");

const MEMBERSHIP_A = membershipId.brand("mem_00000000000000000000000001");

function machineMembership(
  partial: Partial<Pick<MachineMembershipRow, "projectId" | "authorizationScopes">> &
    Pick<MachineMembershipRow, "authorizationScopes">,
): MachineMembershipRow {
  return {
    membershipId: MEMBERSHIP_A,
    organizationId: ORG_A,
    projectId: partial.projectId ?? PROJECT_A,
    machineIdentityId: MACHINE,
    authorizationScopes: partial.authorizationScopes,
  };
}

function machineActor(
  overrides: Partial<{
    tokenScopeProjectId: ReturnType<typeof projectId.brand>;
    tokenScopeEnvironmentId: ReturnType<typeof environmentId.brand> | undefined;
    credentialScopes: readonly (typeof CREDENTIAL_SCOPES)[keyof typeof CREDENTIAL_SCOPES][];
  }> = {},
) {
  return {
    type: "machine" as const,
    machineIdentityId: MACHINE,
    tokenScope: {
      organizationId: ORG_A,
      projectId: overrides.tokenScopeProjectId ?? PROJECT_A,
      environmentId: overrides.tokenScopeEnvironmentId,
    },
    credentialScopes: overrides.credentialScopes ?? [...RUNTIME_INJECTION_CREDENTIAL_SCOPE_BUNDLE],
  };
}

describe("resolveEffectiveAccess for machine actors", () => {
  it("intersects membership, token scope, and credential scopes at a project coordinate", async () => {
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      machineMembership({
        authorizationScopes: [
          AUTHORIZATION_SCOPES.runtimeInjectionRun,
          AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
          AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume,
          AUTHORIZATION_SCOPES.secretNonProtectedWrite,
        ],
      }),
    ]);

    const actor = machineActor({
      credentialScopes: [
        CREDENTIAL_SCOPES.runtimeInjectionRun,
        CREDENTIAL_SCOPES.runtimeInjectionGrantIssue,
      ],
    });

    const result = await resolveEffectiveAccess(
      actor,
      { organizationId: ORG_A, projectId: PROJECT_A },
      { loadMachineMemberships },
    );

    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.runtimeInjectionRun)).toBe(true);
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue)).toBe(
      true,
    );
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.runtimeInjectionGrantConsume)).toBe(
      false,
    );
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.secretNonProtectedWrite)).toBe(false);
    expect(loadMachineMemberships).toHaveBeenCalledTimes(1);
  });

  it("denies approval authority for machine credentials", async () => {
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      machineMembership({
        authorizationScopes: [
          AUTHORIZATION_SCOPES.runtimeInjectionRun,
          AUTHORIZATION_SCOPES.approvalApprove,
          AUTHORIZATION_SCOPES.approvalReject,
        ],
      }),
    ]);

    const result = await resolveEffectiveAccess(
      machineActor(),
      { organizationId: ORG_A, projectId: PROJECT_A, environmentId: ENV_A },
      { loadMachineMemberships },
    );

    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.runtimeInjectionRun)).toBe(true);
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.approvalApprove)).toBe(false);
    expect(hasAuthorizationScope(result, AUTHORIZATION_SCOPES.approvalReject)).toBe(false);
  });

  it("returns empty scopes for cross-project membership at another project coordinate", async () => {
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      machineMembership({
        projectId: PROJECT_A,
        authorizationScopes: [AUTHORIZATION_SCOPES.runtimeInjectionRun],
      }),
    ]);

    const result = await resolveEffectiveAccess(
      machineActor(),
      { organizationId: ORG_A, projectId: PROJECT_B },
      { loadMachineMemberships },
    );

    expect(result.scopes).toEqual([]);
  });

  it("returns empty scopes when token scope project does not match the coordinate", async () => {
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      machineMembership({
        authorizationScopes: [AUTHORIZATION_SCOPES.runtimeInjectionRun],
      }),
    ]);

    const result = await resolveEffectiveAccess(
      machineActor({ tokenScopeProjectId: PROJECT_B }),
      { organizationId: ORG_A, projectId: PROJECT_A },
      { loadMachineMemberships },
    );

    expect(result.scopes).toEqual([]);
  });

  it("returns empty scopes when token scope environment does not match the coordinate", async () => {
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      machineMembership({
        authorizationScopes: [AUTHORIZATION_SCOPES.runtimeInjectionRun],
      }),
    ]);

    const result = await resolveEffectiveAccess(
      machineActor({
        tokenScopeEnvironmentId: environmentId.brand("env_00000000000000000000000099"),
      }),
      { organizationId: ORG_A, projectId: PROJECT_A, environmentId: ENV_A },
      { loadMachineMemberships },
    );

    expect(result.scopes).toEqual([]);
  });

  it("loads machine memberships once for one project coordinate and once for fifty", async () => {
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      machineMembership({
        authorizationScopes: [AUTHORIZATION_SCOPES.runtimeInjectionRun],
      }),
    ]);
    const actor = machineActor();

    await resolveEffectiveAccessBatch(actor, [{ organizationId: ORG_A, projectId: PROJECT_A }], {
      loadMachineMemberships,
    });
    expect(loadMachineMemberships).toHaveBeenCalledTimes(1);

    vi.mocked(loadMachineMemberships).mockClear();

    const fiftyProjects = Array.from({ length: 50 }, (_, index) => {
      const body = (index + 1).toString(16).toUpperCase().padStart(26, "0");
      return {
        organizationId: ORG_A,
        projectId: projectId.brand(`prj_${body}`),
      };
    });

    const results = await resolveEffectiveAccessBatch(actor, fiftyProjects, {
      loadMachineMemberships,
    });

    expect(results).toHaveLength(50);
    expect(loadMachineMemberships).toHaveBeenCalledTimes(1);
  });
});
