import {
  AUTHORIZATION_SCOPES,
  resolveEffectiveAccess,
  type LoadMembershipsFn,
} from "@insecur/access";
import { AUTH_ERROR_CODES, INJECTION_ERROR_CODES } from "@insecur/domain";
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

let protectedEnvironment = true;
let coordinateError: ProjectEnvironmentCoordinateError | undefined;

beforeEach(() => {
  protectedEnvironment = true;
  coordinateError = undefined;
  vi.mocked(resolveEffectiveAccess).mockReset();
  vi.mocked(assertProjectEnvironmentCoordinate).mockClear();
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  class MockTenantInjectionGrantStore {
    insertGrant = vi.fn().mockResolvedValue(undefined);
  }
  const withTenantScope = vi.fn(
    async (_scope: unknown, fn: (ctx: { db: unknown }) => Promise<unknown>) => fn({ db: {} }),
  );
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
    ProjectEnvironmentCoordinateError: actual.ProjectEnvironmentCoordinateError,
  };
});

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    resolveEffectiveAccess: vi.fn(actual.resolveEffectiveAccess),
    auditAccessDenialOnFailure: vi.fn(async (error) => {
      throw error;
    }),
  };
});

vi.mock("../src/resolve-injection-grant-bindings.js", () => ({
  resolveInjectionGrantBinding: vi.fn().mockResolvedValue({
    secretId: "sec_test",
    secretVersionId: "sv_test",
    variableKey: "TEST_KEY",
  }),
}));

vi.mock("@insecur/audit", () => ({
  auditActorUserId: (actor: { userId: string }) => actor.userId,
  recordRuntimeInjectionAudit: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
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

  it("allows protected issuance when effective access includes grant_issue_protected regardless of actor type", async () => {
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
    expect(result.auditEventId).toBe("aud_test");
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
