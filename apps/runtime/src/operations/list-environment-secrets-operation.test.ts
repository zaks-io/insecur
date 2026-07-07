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
import { withTenantScope } from "@insecur/tenant-store";
import type { ListEnvironmentSecretsRpcInput } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listEnvironmentSecretsOperation } from "./list-environment-secrets-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    assertOrganizationMembership: vi.fn(),
    authorizeScopeOrThrow: vi.fn(),
  };
});

const { listByEnvironment } = vi.hoisted(() => ({
  listByEnvironment: vi.fn(),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    TenantSecretMatrixMetadataStore: vi.fn(function MockTenantSecretMatrixMetadataStore() {
      return { listByEnvironment };
    }),
  };
});

const organization = organizationId.brand("org_00000000000000000000000001");
const project = projectId.brand("prj_00000000000000000000000001");
const envA = environmentId.brand("env_00000000000000000000000001");
const request = requestId.generate();
const actorUserId = userId.generate();
const variableKey = "DATABASE_URL" as VariableKey;

describe("listEnvironmentSecretsOperation", () => {
  beforeEach(() => {
    vi.mocked(assertOrganizationMembership).mockReset();
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(withTenantScope).mockReset();
    listByEnvironment.mockReset();
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
    listByEnvironment.mockResolvedValue([]);

    const input: ListEnvironmentSecretsRpcInput = {
      organizationId: organization,
      projectId: project,
      environmentId: envA,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      listEnvironmentSecretsOperation({
        input,
        auditActor: { type: "user", userId: actorUserId },
        accessActor: { type: "user", userId: actorUserId },
      }),
    ).resolves.toEqual({ secrets: [] });

    expect(events).toEqual([
      AUTHORIZATION_SCOPES.projectRead,
      AUTHORIZATION_SCOPES.environmentRead,
      AUTHORIZATION_SCOPES.secretRead,
    ]);
  });

  it("returns environment-scoped secret metadata without values", async () => {
    listByEnvironment.mockResolvedValue([
      {
        secretId: secretId.brand("sec_00000000000000000000000001"),
        variableKey,
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
        currentVersionId: secretVersionId.brand("sv_00000000000000000000000001"),
        currentVersionNumber: 1,
        currentLifecycleState: "live",
        currentVersionCreatedAt: new Date("2026-06-24T01:00:00.000Z"),
        currentPublishedAt: new Date("2026-06-24T01:00:00.000Z"),
      },
    ]);

    const result = await listEnvironmentSecretsOperation({
      input: {
        organizationId: organization,
        projectId: project,
        environmentId: envA,
        actorToken: "verified-by-rpc-entry",
        requestId: request,
      },
      auditActor: { type: "user", userId: actorUserId },
      accessActor: { type: "user", userId: actorUserId },
    });

    expect(result.secrets).toHaveLength(1);
    expect(result.secrets[0]).toMatchObject({
      secretId: "sec_00000000000000000000000001",
      variableKey,
      currentVersion: {
        secretVersionId: "sv_00000000000000000000000001",
        versionNumber: 1,
        lifecycleState: "live",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/valueUtf8|plaintext|password|wrapped|ciphertext/i);
  });
});
