import {
  AUTH_ERROR_CODES,
  environmentId,
  injectionGrantId,
  machineIdentityId,
  organizationId,
  parseDisplayName,
  projectId,
  requestId,
  userId,
  type DisplayName,
  type VariableKey,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listProjectInjectionGrantsOperation } from "./list-project-injection-grants-operation.js";
import { listProjectMachineIdentitiesOperation } from "./list-project-machine-identities-operation.js";

const { listProjectMachineIdentityRows, listProjectInjectionGrantRows } = vi.hoisted(() => ({
  listProjectMachineIdentityRows: vi.fn(async () => []),
  listProjectInjectionGrantRows: vi.fn(async () => []),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(async (_scope, fn) => fn({ db: {}, sql: {} } as never)),
    listProjectMachineIdentityRows,
    listProjectInjectionGrantRows,
  };
});

vi.mock("./authorize-environment-secret-read.js", () => ({
  authorizeProjectReadScope: vi.fn(async () => undefined),
  authorizeProjectEnvironmentReadScopes: vi.fn(async () => undefined),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const VARIABLE_KEY = "DATABASE_URL" as VariableKey;
const USER_ACTOR = { type: "user" as const, userId: USER };

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid display name: ${raw}`);
  }
  return parsed.value;
}

const MACHINE_ACTOR = {
  type: "machine" as const,
  machineIdentityId: MACHINE,
  tokenScope: {
    organizationId: ORG,
    projectId: PROJECT,
  },
  credentialScopes: [] as const,
};

describe("listProjectMachineIdentitiesOperation", () => {
  beforeEach(() => {
    listProjectMachineIdentityRows.mockReset();
    listProjectMachineIdentityRows.mockResolvedValue([]);
  });

  it("denies non-user actors before tenant reads", async () => {
    const { authorizeProjectReadScope } = await import("./authorize-environment-secret-read.js");
    vi.mocked(authorizeProjectReadScope).mockRejectedValueOnce(
      Object.assign(new Error("Missing required permission."), {
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );

    await expect(
      listProjectMachineIdentitiesOperation({
        input: {
          organizationId: ORG,
          projectId: PROJECT,
          requestId: REQ,
          actorToken: "token",
        },
        auditActor: USER_ACTOR,
        accessActor: MACHINE_ACTOR,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });

  it("returns metadata-only machine identities and auth methods", async () => {
    listProjectMachineIdentityRows.mockResolvedValueOnce([
      {
        machineIdentityId: MACHINE,
        organizationId: ORG,
        displayName: testDisplayName("CI deploy"),
        status: "active" as const,
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
        githubActionsOidcMethods: [
          {
            authMethodId: "oidc_00000000000000000000000001",
            machineIdentityId: MACHINE,
            environmentId: ENV,
            githubRepository: "zaks-io/insecur",
            githubEnvironment: "production",
            status: "active" as const,
            createdAt: new Date("2026-06-24T00:00:00.000Z"),
          },
        ],
        environmentDeployKeyMethods: [
          {
            authMethodId: "edk_00000000000000000000000001",
            machineIdentityId: MACHINE,
            environmentId: ENV,
            status: "active" as const,
            nonExpiring: false,
            expiresAt: new Date("2026-12-31T00:00:00.000Z"),
            rotationIntervalSeconds: 86_400,
            rotationReminderIntervalSeconds: 7_200,
            createdAt: new Date("2026-06-24T00:00:00.000Z"),
          },
        ],
      },
    ] as Awaited<ReturnType<typeof listProjectMachineIdentityRows>>);

    const result = await listProjectMachineIdentitiesOperation({
      input: {
        organizationId: ORG,
        projectId: PROJECT,
        requestId: REQ,
        actorToken: "token",
      },
      auditActor: USER_ACTOR,
      accessActor: USER_ACTOR,
    });

    expect(result.machineIdentities).toHaveLength(1);
    expect(result.machineIdentities[0]).toMatchObject({
      machineIdentityId: MACHINE,
      displayName: "CI deploy",
      githubActionsOidcMethods: [expect.objectContaining({ githubRepository: "zaks-io/insecur" })],
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|hash|token|credential|password/i);
  });
});

describe("listProjectInjectionGrantsOperation", () => {
  beforeEach(() => {
    listProjectInjectionGrantRows.mockReset();
    listProjectInjectionGrantRows.mockResolvedValue([]);
  });

  it("denies non-user actors before tenant reads", async () => {
    const { authorizeProjectEnvironmentReadScopes } =
      await import("./authorize-environment-secret-read.js");
    vi.mocked(authorizeProjectEnvironmentReadScopes).mockRejectedValueOnce(
      Object.assign(new Error("Missing required permission."), {
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );

    await expect(
      listProjectInjectionGrantsOperation({
        input: {
          organizationId: ORG,
          projectId: PROJECT,
          requestId: REQ,
          actorToken: "token",
        },
        auditActor: USER_ACTOR,
        accessActor: MACHINE_ACTOR,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });

  it("returns metadata-only grants with principal-chain attribution", async () => {
    listProjectInjectionGrantRows.mockResolvedValueOnce([
      {
        grantId: GRANT,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        variableKeys: [VARIABLE_KEY],
        status: "consumed",
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
        expiresAt: new Date("2026-06-24T00:05:00.000Z"),
        consumedAt: new Date("2026-06-24T00:01:00.000Z"),
        revokedAt: null,
        revokedReason: null,
        issuedByActor: {
          actorType: "user" as const,
          userId: USER,
          machineIdentityId: null,
          details: {
            agentSessionId: "ags_00000000000000000000000011",
            harnessName: "cursor",
          },
        },
        consumedByActor: {
          actorType: "machine" as const,
          userId: null,
          machineIdentityId: MACHINE,
          details: {
            githubRunId: "1234567890",
          },
        },
      },
    ] as Awaited<ReturnType<typeof listProjectInjectionGrantRows>>);

    const result = await listProjectInjectionGrantsOperation({
      input: {
        organizationId: ORG,
        projectId: PROJECT,
        requestId: REQ,
        actorToken: "token",
      },
      auditActor: USER_ACTOR,
      accessActor: USER_ACTOR,
    });

    expect(result.grants).toEqual([
      expect.objectContaining({
        grantId: GRANT,
        status: "consumed",
        issuedByActor: expect.objectContaining({
          actorType: "user",
          details: expect.objectContaining({ harnessName: "cursor" }),
        }),
        consumedByActor: expect.objectContaining({
          actorType: "machine",
          machineIdentityId: MACHINE,
        }),
      }),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/secret|hash|token|credential|password/i);
  });

  it("serializes revoked grant metadata without token material", async () => {
    listProjectInjectionGrantRows.mockResolvedValueOnce([
      {
        grantId: GRANT,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        variableKeys: [VARIABLE_KEY],
        status: "revoked" as const,
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
        expiresAt: new Date("2026-06-24T00:05:00.000Z"),
        consumedAt: null,
        revokedAt: new Date("2026-06-24T00:02:00.000Z"),
        revokedReason: "compromise_version_invalidation" as const,
      },
    ] as Awaited<ReturnType<typeof listProjectInjectionGrantRows>>);

    const result = await listProjectInjectionGrantsOperation({
      input: {
        organizationId: ORG,
        projectId: PROJECT,
        requestId: REQ,
        actorToken: "token",
      },
      auditActor: USER_ACTOR,
      accessActor: USER_ACTOR,
    });

    expect(result.grants[0]).toEqual({
      grantId: GRANT,
      environmentId: ENV,
      variableKeys: [VARIABLE_KEY],
      status: "revoked",
      createdAt: "2026-06-24T00:00:00.000Z",
      expiresAt: "2026-06-24T00:05:00.000Z",
      revokedAt: "2026-06-24T00:02:00.000Z",
      revokedReason: "compromise_version_invalidation",
    });
  });
});
