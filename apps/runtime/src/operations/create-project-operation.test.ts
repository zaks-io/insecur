import {
  AUTHORIZATION_SCOPES,
  assertOrganizationMembership,
  authorizeScopeOrThrow,
  hasAuthorizationScope,
  resolveEffectiveAccess,
} from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  ENVIRONMENT_ERROR_CODES,
  ONBOARDING_ERROR_CODES,
  environmentId,
  organizationId,
  parseDisplayName,
  projectId,
  requestId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import {
  TenantEnvironmentLifecycleStore,
  copyEnvironmentSecretShapes,
  isUniqueConstraintViolation,
  withTenantScope,
} from "@insecur/tenant-store";
import type { CreateProjectRpcInput } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createProjectOperation } from "./create-project-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    assertOrganizationMembership: vi.fn(),
    resolveEffectiveAccess: vi.fn(),
    hasAuthorizationScope: vi.fn(),
    authorizeScopeOrThrow: vi.fn(),
  };
});

const { createProject } = vi.hoisted(() => ({
  createProject: vi.fn(),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    isUniqueConstraintViolation: vi.fn(),
    TenantProjectMetadataStore: vi.fn(function MockTenantProjectMetadataStore() {
      return { create: createProject };
    }),
    TenantEnvironmentLifecycleStore: vi.fn(),
    copyEnvironmentSecretShapes: vi.fn(),
  };
});

const organization = organizationId.brand("org_00000000000000000000000001");
const createdProject = projectId.brand("prj_00000000000000000000000001");
const request = requestId.generate();
const actorUserId = userId.generate();

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

describe("createProjectOperation", () => {
  beforeEach(() => {
    vi.mocked(assertOrganizationMembership).mockReset();
    vi.mocked(resolveEffectiveAccess).mockReset();
    vi.mocked(hasAuthorizationScope).mockReset();
    vi.mocked(withTenantScope).mockReset();
    vi.mocked(isUniqueConstraintViolation).mockReset();
    createProject.mockReset();
    vi.mocked(assertOrganizationMembership).mockResolvedValue(undefined);
    vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) =>
      fn({ db: {}, sql: {} } as never),
    );
    vi.mocked(hasAuthorizationScope).mockImplementation(
      (_access, scope) => scope === AUTHORIZATION_SCOPES.projectConfigure,
    );
  });

  it("creates a project when the actor has project:configure", async () => {
    const createdAt = new Date("2026-06-24T00:00:00.000Z");
    createProject.mockResolvedValue({
      projectId: createdProject,
      organizationId: organization,
      displayName: testDisplayName("New project"),
      createdAt,
    });

    const input: CreateProjectRpcInput = {
      organizationId: organization,
      projectId: createdProject,
      displayName: testDisplayName("New project"),
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      createProjectOperation({
        input,
        auditActor: { type: "user", userId: actorUserId },
        accessActor: { type: "user", userId: actorUserId },
      }),
    ).resolves.toEqual({
      projectId: createdProject,
      organizationId: organization,
      displayName: testDisplayName("New project"),
      createdAt: "2026-06-24T00:00:00.000Z",
    });
  });

  it("denies when project:configure is missing", async () => {
    vi.mocked(hasAuthorizationScope).mockReturnValue(false);

    await expect(
      createProjectOperation({
        input: {
          organizationId: organization,
          projectId: createdProject,
          displayName: testDisplayName("New project"),
          actorToken: "verified-by-rpc-entry",
          requestId: request,
        },
        auditActor: { type: "user", userId: actorUserId },
        accessActor: { type: "user", userId: actorUserId },
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });

  it("maps unique conflicts to onboarding.resource_conflict", async () => {
    createProject.mockRejectedValue(new Error("duplicate"));
    vi.mocked(isUniqueConstraintViolation).mockReturnValue(true);

    await expect(
      createProjectOperation({
        input: {
          organizationId: organization,
          projectId: createdProject,
          displayName: testDisplayName("New project"),
          actorToken: "verified-by-rpc-entry",
          requestId: request,
        },
        auditActor: { type: "user", userId: actorUserId },
        accessActor: { type: "user", userId: actorUserId },
      }),
    ).rejects.toMatchObject({ code: ONBOARDING_ERROR_CODES.resourceConflict });
  });
});

describe("createEnvironmentOperation", () => {
  beforeEach(() => {
    vi.mocked(assertOrganizationMembership).mockReset();
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(withTenantScope).mockReset();
    vi.mocked(isUniqueConstraintViolation).mockReset();
    vi.mocked(assertOrganizationMembership).mockResolvedValue(undefined);
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
  });

  it("copies shapes only and reports copiedShapeCount", async () => {
    const sourceEnv = environmentId.brand("env_00000000000000000000000001");
    const targetEnv = environmentId.brand("env_00000000000000000000000002");
    const createdAt = new Date("2026-06-24T00:00:00.000Z");
    const createEnvironment = vi.fn().mockResolvedValue({
      environmentId: targetEnv,
      organizationId: organization,
      projectId: createdProject,
      displayName: testDisplayName("Staging"),
      lifecycleStage: "development",
      isProtected: false,
      createdAt,
    });
    const getById = vi.fn().mockResolvedValue({
      environmentId: sourceEnv,
      organizationId: organization,
      projectId: createdProject,
      displayName: testDisplayName("Development"),
      lifecycleStage: "development",
      isProtected: false,
      createdAt,
    });
    vi.mocked(TenantEnvironmentLifecycleStore).mockImplementation(function MockStore() {
      return { create: createEnvironment, getById };
    } as never);
    vi.mocked(copyEnvironmentSecretShapes).mockResolvedValue(2);
    vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) =>
      fn({ db: {}, sql: {} } as never),
    );

    const { createEnvironmentOperation } = await import("./create-environment-operation.js");
    const result = await createEnvironmentOperation({
      input: {
        organizationId: organization,
        projectId: createdProject,
        environmentId: targetEnv,
        displayName: testDisplayName("Staging"),
        copyShapesFromEnvironmentId: sourceEnv,
        actorToken: "verified-by-rpc-entry",
        requestId: request,
      },
      auditActor: { type: "user", userId: actorUserId },
      accessActor: { type: "user", userId: actorUserId },
    });

    expect(result.copiedShapeCount).toBe(2);
    expect(copyEnvironmentSecretShapes).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        sourceEnvironmentId: sourceEnv,
        targetEnvironmentId: targetEnv,
      }),
    );
  });

  it("rejects a source environment outside the project", async () => {
    const sourceEnv = environmentId.brand("env_00000000000000000000000001");
    const targetEnv = environmentId.brand("env_00000000000000000000000002");
    const getById = vi.fn().mockResolvedValue(null);
    vi.mocked(TenantEnvironmentLifecycleStore).mockImplementation(function MockStore() {
      return { create: vi.fn(), getById };
    } as never);
    vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) =>
      fn({ db: {}, sql: {} } as never),
    );

    const { createEnvironmentOperation } = await import("./create-environment-operation.js");
    await expect(
      createEnvironmentOperation({
        input: {
          organizationId: organization,
          projectId: createdProject,
          environmentId: targetEnv,
          displayName: testDisplayName("Staging"),
          copyShapesFromEnvironmentId: sourceEnv,
          actorToken: "verified-by-rpc-entry",
          requestId: request,
        },
        auditActor: { type: "user", userId: actorUserId },
        accessActor: { type: "user", userId: actorUserId },
      }),
    ).rejects.toMatchObject({ code: ENVIRONMENT_ERROR_CODES.notFound });
  });
});
