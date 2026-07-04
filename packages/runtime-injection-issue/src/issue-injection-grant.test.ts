import {
  AUTHORIZATION_SCOPES,
  resolveEffectiveAccess,
  type LoadMachineMembershipsFn,
} from "@insecur/access";
import {
  recordRuntimeInjectionAudit,
  recordRuntimeInjectionAuditInTenantScope,
} from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  auditEventId,
  environmentId,
  machineIdentityId,
  membershipId,
  organizationId,
  parseVariableKey,
  projectId,
  runtimePolicyId,
  INJECTION_ERROR_CODES,
} from "@insecur/domain";
import { assertProjectEnvironmentCoordinate } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  executeIssueInjectionGrant,
  issueInjectionGrantWithAudit,
} from "./issue-injection-grant.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const MACHINE_MEMBERSHIP = membershipId.brand("mem_00000000000000000000000001");
const AUDIT_EVENT = auditEventId.brand("aud_00000000000000000000000001");
const TEST_VARIABLE_KEY = (() => {
  const parsed = parseVariableKey("TEST_KEY");
  if (!parsed.ok) {
    throw new Error("test variable key fixture must be valid");
  }
  return parsed.value;
})();

interface MockTransactionDb {
  pendingGrants: unknown[];
}

interface MockCoordinateOptions {
  coordinate: {
    organizationId: typeof ORG;
  };
}

const { committedGrants, insertGrant, withTenantScope } = vi.hoisted(() => ({
  committedGrants: [] as unknown[],
  insertGrant: vi.fn((db: MockTransactionDb, input: unknown) => {
    db.pendingGrants.push(input);
    return Promise.resolve();
  }),
  withTenantScope: vi.fn(
    async (
      _scope: unknown,
      fn: (ctx: { db: MockTransactionDb; sql: unknown }) => Promise<unknown>,
    ) => {
      const db = { pendingGrants: [] };
      const result = await fn({ db, sql: {} });
      committedGrants.push(...db.pendingGrants);
      return result;
    },
  ),
}));

const baseMachineInput = {
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  selector: { kind: "variable_key" as const, variableKey: TEST_VARIABLE_KEY },
  actor: {
    type: "machine" as const,
    machineIdentityId: MACHINE,
    tokenScope: {
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
    },
    credentialScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected],
  },
};

beforeEach(() => {
  committedGrants.length = 0;
  insertGrant.mockClear();
  withTenantScope.mockClear();
  vi.mocked(resolveEffectiveAccess).mockReset();
  vi.mocked(assertProjectEnvironmentCoordinate).mockClear();
  vi.mocked(recordRuntimeInjectionAudit).mockClear();
  vi.mocked(recordRuntimeInjectionAuditInTenantScope).mockReset();
  vi.mocked(recordRuntimeInjectionAuditInTenantScope).mockResolvedValue({
    auditEventId: AUDIT_EVENT,
  });
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  class MockTenantInjectionGrantStore {
    constructor(private readonly db: MockTransactionDb) {}

    async insertGrant(input: unknown): Promise<void> {
      await insertGrant(this.db, input);
    }
  }
  class MockTenantSecretVersionStore {
    getCurrentVersion = vi.fn().mockResolvedValue({ secretVersionId: "sv_test" });
  }
  class MockTenantRuntimeInjectionPolicyStore {
    getPolicyById = vi.fn().mockResolvedValue({
      policyId: runtimePolicyId.brand("rp_00000000000000000000000001"),
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      displayName: "deploy-policy",
      activeVersionId: "rpv_00000000000000000000000001",
      disabledAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    getVersionById = vi.fn().mockResolvedValue({
      variableKeys: ["TEST_KEY"],
      secretIds: [],
    });
  }
  const assertProjectEnvironmentCoordinate = vi.fn((db: MockTransactionDb, coordinate: unknown) => {
    void db;
    void coordinate;
    return Promise.resolve({ isProtected: true });
  });
  return {
    ...actual,
    withTenantScope,
    assertProjectEnvironmentCoordinate,
    assertProjectEnvironmentCoordinateWithScope: vi.fn((options: MockCoordinateOptions) =>
      withTenantScope(
        { kind: "organization", organizationId: options.coordinate.organizationId },
        ({ db }) => assertProjectEnvironmentCoordinate(db, options.coordinate),
      ),
    ),
    TenantInjectionGrantStore: MockTenantInjectionGrantStore,
    TenantSecretVersionStore: MockTenantSecretVersionStore,
    TenantRuntimeInjectionPolicyStore: MockTenantRuntimeInjectionPolicyStore,
    resolveSecretForRead: vi.fn().mockResolvedValue({
      secretId: "sec_test",
      variableKey: "TEST_KEY" as never,
    }),
  };
});

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    resolveEffectiveAccess: vi.fn(actual.resolveEffectiveAccess),
    auditAccessDenialOnFailure: vi.fn(actual.auditAccessDenialOnFailure),
  };
});

vi.mock("@insecur/audit", () => ({
  recordRuntimeInjectionAudit: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  recordRuntimeInjectionAuditInTenantScope: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
}));

function mockMachineAccess(loadMachineMemberships: LoadMachineMembershipsFn): void {
  vi.mocked(resolveEffectiveAccess).mockImplementation(async (actor, coordinate, deps) => {
    const actual = await vi.importActual<typeof import("@insecur/access")>("@insecur/access");
    return actual.resolveEffectiveAccess(actor, coordinate, {
      ...deps,
      loadMachineMemberships,
    });
  });
}

describe("issueInjectionGrant machine actors", () => {
  it("fails closed with insufficient_scope when machine token scope does not match", async () => {
    const mismatchedProject = projectId.brand("prj_00000000000000000000000002");
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(() =>
      Promise.resolve([
        {
          membershipId: MACHINE_MEMBERSHIP,
          organizationId: ORG,
          projectId: PROJECT,
          machineIdentityId: MACHINE,
          authorizationScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected],
        },
      ]),
    );
    mockMachineAccess(loadMachineMemberships);

    await expect(
      executeIssueInjectionGrant({
        ...baseMachineInput,
        actor: {
          ...baseMachineInput.actor,
          tokenScope: {
            organizationId: ORG,
            projectId: mismatchedProject,
            environmentId: ENV,
          },
        },
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(assertProjectEnvironmentCoordinate).not.toHaveBeenCalled();
  });

  it("records denied machine issue attempts with machine audit actor metadata", async () => {
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({ organizationId: ORG, scopes: [] });

    await expect(issueInjectionGrantWithAudit(baseMachineInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "issue",
        outcome: "denied",
        actor: { type: "machine", machineIdentityId: MACHINE },
        reasonCode: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });

  it("issues grants for scoped machine actors through Effective Access", async () => {
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(() =>
      Promise.resolve([
        {
          membershipId: MACHINE_MEMBERSHIP,
          organizationId: ORG,
          projectId: PROJECT,
          machineIdentityId: MACHINE,
          authorizationScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected],
        },
      ]),
    );
    mockMachineAccess(loadMachineMemberships);

    const result = await executeIssueInjectionGrant(baseMachineInput);

    expect(result.grantId).toMatch(/^igr_[0-9A-Z]{26}$/);
    expect(loadMachineMemberships).toHaveBeenCalledTimes(1);
    expect(recordRuntimeInjectionAuditInTenantScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        phase: "issue",
        outcome: "success",
        actor: { type: "machine", machineIdentityId: MACHINE },
      }),
    );
    expect(committedGrants).toHaveLength(1);
  });

  it("denies grant issue when the bound runtime policy key does not allow the selector", async () => {
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(() =>
      Promise.resolve([
        {
          membershipId: MACHINE_MEMBERSHIP,
          organizationId: ORG,
          projectId: PROJECT,
          machineIdentityId: MACHINE,
          authorizationScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected],
        },
      ]),
    );
    mockMachineAccess(loadMachineMemberships);

    await expect(
      executeIssueInjectionGrant({
        ...baseMachineInput,
        actor: {
          ...baseMachineInput.actor,
          tokenScope: {
            ...baseMachineInput.actor.tokenScope,
            runtimePolicyKeyId: runtimePolicyId.brand("rp_00000000000000000000000001"),
          },
        },
        selector: {
          kind: "variable_key",
          variableKey: (() => {
            const parsed = parseVariableKey("OTHER_KEY");
            if (!parsed.ok) {
              throw new Error("test variable key fixture must be valid");
            }
            return parsed.value;
          })(),
        },
      }),
    ).rejects.toMatchObject({ code: INJECTION_ERROR_CODES.grantDenied });

    expect(committedGrants).toHaveLength(0);
  });
});
