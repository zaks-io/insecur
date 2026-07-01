import {
  AUTHORIZATION_SCOPES,
  resolveEffectiveAccess,
  type LoadMachineMembershipsFn,
  type LoadMembershipsFn,
} from "@insecur/access";
import {
  recordRuntimeInjectionAudit,
  recordRuntimeInjectionAuditInTenantScope,
} from "@insecur/audit";
import {
  AUTH_ERROR_CODES,
  INJECTION_ERROR_CODES,
  auditEventId,
  machineIdentityId,
  membershipId,
} from "@insecur/domain";
import { environmentId, organizationId, projectId, userId } from "@insecur/domain";
import {
  ProjectEnvironmentCoordinateError,
  assertProjectEnvironmentCoordinate,
} from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ISSUE_PROTECTED_SCOPE,
  ISSUE_SCOPE,
  resolveIssueGrantRequiredScope,
} from "../src/assert-runtime-injection-access.js";
import {
  executeIssueInjectionGrant,
  issueInjectionGrantWithAudit,
} from "../src/issue-injection-grant.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const ACTOR_USER = userId.brand("usr_00000000000000000000000001");
const ACTOR_MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const MACHINE_MEMBERSHIP = membershipId.brand("mem_00000000000000000000000001");
const AUDIT_EVENT = auditEventId.brand("aud_00000000000000000000000001");

let protectedEnvironment = true;
let coordinateError: ProjectEnvironmentCoordinateError | undefined;

interface MockTransactionDb {
  pendingGrants: unknown[];
}

const { committedGrants, insertGrant, withTenantScope } = vi.hoisted(() => ({
  committedGrants: [] as unknown[],
  insertGrant: vi.fn(async (db: MockTransactionDb, input: unknown) => {
    db.pendingGrants.push(input);
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

beforeEach(() => {
  protectedEnvironment = true;
  coordinateError = undefined;
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
  const assertProjectEnvironmentCoordinate = vi.fn(async () => {
    if (coordinateError !== undefined) {
      throw coordinateError;
    }
    return { isProtected: protectedEnvironment };
  });
  return {
    ...actual,
    withTenantScope,
    assertProjectEnvironmentCoordinate,
    assertProjectEnvironmentCoordinateWithScope: vi.fn(async (options) => {
      try {
        return await withTenantScope(
          { kind: "organization", organizationId: options.coordinate.organizationId },
          ({ db }) => assertProjectEnvironmentCoordinate(db, options.coordinate),
        );
      } catch (error) {
        if (error instanceof actual.ProjectEnvironmentCoordinateError) {
          await options.onCoordinateDenied?.().catch(() => undefined);
          throw options.createCoordinateError();
        }
        throw error;
      }
    }),
    TenantInjectionGrantStore: MockTenantInjectionGrantStore,
    TenantSecretVersionStore: MockTenantSecretVersionStore,
    ProjectEnvironmentCoordinateError: actual.ProjectEnvironmentCoordinateError,
    resolveSecretForRead: vi.fn().mockResolvedValue({
      secretId: "sec_test",
      variableKey: "TEST_KEY",
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

describe("resolveIssueGrantRequiredScope", () => {
  it("requires grant_issue for non-protected environments", () => {
    expect(resolveIssueGrantRequiredScope(false)).toBe(ISSUE_SCOPE);
    expect(resolveIssueGrantRequiredScope(false)).toBe(
      AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue,
    );
  });

  it("requires grant_issue_protected only for protected environments", () => {
    expect(resolveIssueGrantRequiredScope(true)).toBe(ISSUE_PROTECTED_SCOPE);
    expect(resolveIssueGrantRequiredScope(true)).toBe(
      AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected,
    );
  });
});

describe("executeIssueInjectionGrant protected issuance", () => {
  const baseInput = {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    selector: { kind: "variable_key" as const, variableKey: "TEST_KEY" as const },
    actor: { type: "user" as const, userId: ACTOR_USER },
  };
  const baseMachineInput = {
    ...baseInput,
    actor: {
      type: "machine" as const,
      machineIdentityId: ACTOR_MACHINE,
      tokenScope: {
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
      },
      credentialScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected],
    },
  };

  it("denies protected issuance when effective access lacks grant_issue_protected", async () => {
    protectedEnvironment = true;
    const loadMemberships: LoadMembershipsFn = vi.fn(async () => [
      {
        membershipId: "mem_test" as never,
        organizationId: ORG,
        projectId: PROJECT,
        userId: ACTOR_USER,
        rolePreset: "developer",
      },
    ]);

    vi.mocked(resolveEffectiveAccess).mockImplementation(async (actor, coordinate, deps) => {
      const actual = await vi.importActual<typeof import("@insecur/access")>("@insecur/access");
      return actual.resolveEffectiveAccess(actor, coordinate, {
        ...deps,
        loadMemberships,
      });
    });

    await expect(executeIssueInjectionGrant(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  });

  it("allows protected issuance when effective access includes grant_issue_protected", async () => {
    protectedEnvironment = true;
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected],
    });

    const result = await executeIssueInjectionGrant(baseInput);
    expect(result.grantId).toMatch(/^igr_[0-9A-Z]{26}$/);
    expect(resolveEffectiveAccess).toHaveBeenCalledWith(
      { type: "user", userId: ACTOR_USER },
      { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      expect.objectContaining({ memo: expect.anything() }),
    );
  });

  it("requires grant_issue for non-protected environments even when grant_issue_protected is present", async () => {
    protectedEnvironment = false;
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected],
    });

    await expect(executeIssueInjectionGrant(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  });

  it("allows non-protected issuance when effective access includes grant_issue", async () => {
    protectedEnvironment = false;
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue],
    });

    const result = await executeIssueInjectionGrant(baseInput);
    expect(result.grantId).toMatch(/^igr_[0-9A-Z]{26}$/);
    expect(result.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.auditEventId).toBe(AUDIT_EVENT);
    expect(committedGrants).toHaveLength(1);
  });

  it("rolls back the grant insert when the success audit insert fails", async () => {
    protectedEnvironment = false;
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue],
    });
    vi.mocked(recordRuntimeInjectionAuditInTenantScope).mockRejectedValueOnce(
      new Error("audit insert failed"),
    );

    await expect(executeIssueInjectionGrant(baseInput)).rejects.toThrow("audit insert failed");

    expect(insertGrant).toHaveBeenCalledOnce();
    expect(recordRuntimeInjectionAuditInTenantScope).toHaveBeenCalledOnce();
    expect(committedGrants).toEqual([]);
  });

  it("fails closed for a machine actor whose token scope does not match the coordinate", async () => {
    const mismatchedProject = projectId.brand("prj_00000000000000000000000002");
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      {
        membershipId: MACHINE_MEMBERSHIP,
        organizationId: ORG,
        projectId: PROJECT,
        machineIdentityId: ACTOR_MACHINE,
        authorizationScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected],
      },
    ]);
    vi.mocked(resolveEffectiveAccess).mockImplementation(async (actor, coordinate, deps) => {
      const actual = await vi.importActual<typeof import("@insecur/access")>("@insecur/access");
      return actual.resolveEffectiveAccess(actor, coordinate, {
        ...deps,
        loadMachineMemberships,
      });
    });

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

    expect(resolveEffectiveAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "machine",
        machineIdentityId: ACTOR_MACHINE,
      }),
      { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      expect.objectContaining({ memo: expect.anything() }),
    );
    expect(assertProjectEnvironmentCoordinate).not.toHaveBeenCalled();
  });

  it("records denied machine issue attempts with metadata-only machine audit actor", async () => {
    protectedEnvironment = true;
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({ scopes: [] });

    await expect(issueInjectionGrantWithAudit(baseMachineInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(recordRuntimeInjectionAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "issue",
        outcome: "denied",
        actor: { type: "machine", machineIdentityId: ACTOR_MACHINE },
        reasonCode: AUTH_ERROR_CODES.insufficientScope,
      }),
    );
  });

  it("issues for a scoped machine actor through the Effective Access machine path", async () => {
    protectedEnvironment = true;
    const loadMachineMemberships: LoadMachineMembershipsFn = vi.fn(async () => [
      {
        membershipId: MACHINE_MEMBERSHIP,
        organizationId: ORG,
        projectId: PROJECT,
        machineIdentityId: ACTOR_MACHINE,
        authorizationScopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssueProtected],
      },
    ]);
    vi.mocked(resolveEffectiveAccess).mockImplementation(async (actor, coordinate, deps) => {
      const actual = await vi.importActual<typeof import("@insecur/access")>("@insecur/access");
      return actual.resolveEffectiveAccess(actor, coordinate, {
        ...deps,
        loadMachineMemberships,
      });
    });

    const result = await executeIssueInjectionGrant(baseMachineInput);

    expect(result.grantId).toMatch(/^igr_[0-9A-Z]{26}$/);
    expect(loadMachineMemberships).toHaveBeenCalledTimes(1);
    expect(resolveEffectiveAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "machine",
        machineIdentityId: ACTOR_MACHINE,
      }),
      { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
      expect.objectContaining({ memo: expect.anything() }),
    );
    expect(recordRuntimeInjectionAuditInTenantScope).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        phase: "issue",
        outcome: "success",
        actor: { type: "machine", machineIdentityId: ACTOR_MACHINE },
      }),
    );
    expect(committedGrants).toHaveLength(1);
  });

  it("records insufficient_scope denial through issueInjectionGrantWithAudit", async () => {
    protectedEnvironment = true;
    coordinateError = undefined;
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue],
    });

    await expect(issueInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
  });

  it("maps coordinate validation failures to grant_denied through issueInjectionGrantWithAudit", async () => {
    coordinateError = new ProjectEnvironmentCoordinateError("environment not found");
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      scopes: [AUTHORIZATION_SCOPES.runtimeInjectionGrantIssue],
    });

    await expect(issueInjectionGrantWithAudit(baseInput)).rejects.toMatchObject({
      code: INJECTION_ERROR_CODES.grantDenied,
    });
  });

  describe("coordinate-validity oracle (INS-181)", () => {
    // An actor holding neither issuance atom must get the SAME stable denial code whether the
    // foreign coordinate is valid or invalid, so the error surface cannot reveal env existence.
    it("returns insufficient_scope for a valid foreign coordinate when the actor holds no issuance atom", async () => {
      coordinateError = undefined;
      vi.mocked(resolveEffectiveAccess).mockResolvedValue({ scopes: [] });

      await expect(executeIssueInjectionGrant(baseInput)).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.insufficientScope,
      });
    });

    it("returns insufficient_scope for an invalid foreign coordinate when the actor holds no issuance atom", async () => {
      coordinateError = new ProjectEnvironmentCoordinateError("environment not found");
      vi.mocked(resolveEffectiveAccess).mockResolvedValue({ scopes: [] });

      await expect(executeIssueInjectionGrant(baseInput)).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.insufficientScope,
      });
    });

    it("does not read the tenant coordinate when the actor holds no issuance atom", async () => {
      // If the coordinate read ran, this invalid coordinate would surface grant_denied; proving the
      // denial stays insufficient_scope proves authorization precedes (and short-circuits) the read.
      coordinateError = new ProjectEnvironmentCoordinateError("environment not found");
      vi.mocked(resolveEffectiveAccess).mockResolvedValue({ scopes: [] });

      await expect(executeIssueInjectionGrant(baseInput)).rejects.not.toMatchObject({
        code: INJECTION_ERROR_CODES.grantDenied,
      });
      expect(assertProjectEnvironmentCoordinate).not.toHaveBeenCalled();
    });
  });
});
