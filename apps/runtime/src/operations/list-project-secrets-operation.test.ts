import {
  AUTHORIZATION_SCOPES,
  assertOrganizationMembership,
  authorizeScopeOrThrow,
} from "@insecur/access";
import {
  environmentId,
  organizationId,
  projectId,
  requestId,
  secretId,
  secretVersionId,
  userId,
  type VariableKey,
} from "@insecur/domain";
import {
  TenantEnvironmentLifecycleStore,
  TenantSecretMatrixMetadataStore,
  withTenantScope,
} from "@insecur/tenant-store";
import type { ListProjectSecretsRpcInput } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listProjectSecretsOperation } from "./list-project-secrets-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    assertOrganizationMembership: vi.fn(),
    authorizeScopeOrThrow: vi.fn(),
  };
});

const { listByProjectEnvironments, listByProjectSecrets } = vi.hoisted(() => ({
  listByProjectEnvironments: vi.fn(),
  listByProjectSecrets: vi.fn(),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    TenantEnvironmentLifecycleStore: vi.fn(function MockTenantEnvironmentLifecycleStore() {
      return { listByProject: listByProjectEnvironments };
    }),
    TenantSecretMatrixMetadataStore: vi.fn(function MockTenantSecretMatrixMetadataStore() {
      return { listByProject: listByProjectSecrets };
    }),
  };
});

const organization = organizationId.brand("org_00000000000000000000000001");
const project = projectId.brand("prj_00000000000000000000000001");
const envA = environmentId.brand("env_00000000000000000000000001");
const envB = environmentId.brand("env_00000000000000000000000002");
const request = requestId.generate();
const actorUserId = userId.generate();
const variableKey = "DATABASE_URL" as VariableKey;

describe("listProjectSecretsOperation", () => {
  beforeEach(() => {
    vi.mocked(assertOrganizationMembership).mockReset();
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(withTenantScope).mockReset();
    listByProjectEnvironments.mockReset();
    listByProjectSecrets.mockReset();
    vi.mocked(assertOrganizationMembership).mockResolvedValue(undefined);
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
    vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) =>
      fn({ db: {}, sql: {} } as never),
    );
  });

  it("authorizes project, environment, and secret read scopes before listing", async () => {
    const events: string[] = [];
    vi.mocked(authorizeScopeOrThrow).mockImplementation(async (input) => {
      events.push(input.requiredScope);
    });
    listByProjectEnvironments.mockResolvedValue([]);
    listByProjectSecrets.mockResolvedValue([]);

    const input: ListProjectSecretsRpcInput = {
      organizationId: organization,
      projectId: project,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      listProjectSecretsOperation({
        input,
        auditActor: { type: "user", userId: actorUserId },
        accessActor: { type: "user", userId: actorUserId },
      }),
    ).resolves.toEqual({ environments: [], rows: [] });

    expect(events).toEqual([
      AUTHORIZATION_SCOPES.projectRead,
      AUTHORIZATION_SCOPES.environmentRead,
      AUTHORIZATION_SCOPES.secretRead,
    ]);
  });

  it("returns matrix rows with per-environment drift metadata", async () => {
    listByProjectEnvironments.mockResolvedValue([
      {
        environmentId: envA,
        organizationId: organization,
        projectId: project,
        displayName: "Staging",
        lifecycleStage: "staging",
        isProtected: false,
        previewNonProductionOptDown: null,
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
      },
      {
        environmentId: envB,
        organizationId: organization,
        projectId: project,
        displayName: "Production",
        lifecycleStage: "production",
        isProtected: true,
        previewNonProductionOptDown: null,
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
      },
    ]);
    listByProjectSecrets.mockResolvedValue([
      {
        secretId: secretId.brand("sec_00000000000000000000000001"),
        environmentId: envA,
        variableKey,
        versionNumber: 1,
        secretVersionId: secretVersionId.brand("sv_00000000000000000000000001"),
        lifecycleState: "live",
        lastSetAt: new Date("2026-06-24T01:00:00.000Z"),
        lastSetActor: { actorType: "user", userId: actorUserId, machineIdentityId: null },
      },
      {
        secretId: secretId.brand("sec_00000000000000000000000002"),
        environmentId: envB,
        variableKey,
        versionNumber: 3,
        secretVersionId: secretVersionId.brand("sv_00000000000000000000000002"),
        lifecycleState: "live",
        lastSetAt: new Date("2026-06-25T01:00:00.000Z"),
        lastSetActor: { actorType: "user", userId: actorUserId, machineIdentityId: null },
      },
    ]);

    const result = await listProjectSecretsOperation({
      input: {
        organizationId: organization,
        projectId: project,
        actorToken: "verified-by-rpc-entry",
        requestId: request,
      },
      auditActor: { type: "user", userId: actorUserId },
      accessActor: { type: "user", userId: actorUserId },
    });

    expect(result.environments).toHaveLength(2);
    expect(result.environments[1]).toMatchObject({ isProtected: true });
    expect(result.rows).toEqual([
      {
        variableKey,
        cells: [
          expect.objectContaining({ environmentId: envA, present: true, versionNumber: 1 }),
          expect.objectContaining({ environmentId: envB, present: true, versionNumber: 3 }),
        ],
      },
    ]);
    expect(TenantEnvironmentLifecycleStore).toHaveBeenCalled();
    expect(TenantSecretMatrixMetadataStore).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/ciphertext|valueUtf8|plaintext|password/i);
  });
});
