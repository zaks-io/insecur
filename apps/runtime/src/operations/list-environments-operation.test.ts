import {
  AUTHORIZATION_SCOPES,
  assertOrganizationMembership,
  authorizeScopeOrThrow,
} from "@insecur/access";
import { organizationId, projectId, requestId, userId } from "@insecur/domain";
import { TenantEnvironmentLifecycleStore, withTenantScope } from "@insecur/tenant-store";
import type { ListEnvironmentsRpcInput } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listEnvironmentsOperation } from "./list-environments-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    assertOrganizationMembership: vi.fn(),
    authorizeScopeOrThrow: vi.fn(),
  };
});

const { listByProject } = vi.hoisted(() => ({
  listByProject: vi.fn(),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    TenantEnvironmentLifecycleStore: vi.fn(function MockTenantEnvironmentLifecycleStore() {
      return { listByProject };
    }),
  };
});

const organization = organizationId.brand("org_00000000000000000000000001");
const project = projectId.brand("prj_00000000000000000000000001");
const request = requestId.generate();
const actorUserId = userId.generate();

describe("listEnvironmentsOperation", () => {
  beforeEach(() => {
    vi.mocked(assertOrganizationMembership).mockReset();
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(withTenantScope).mockReset();
    listByProject.mockReset();
    vi.mocked(assertOrganizationMembership).mockResolvedValue(undefined);
    vi.mocked(authorizeScopeOrThrow).mockResolvedValue(undefined);
    vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) =>
      fn({ db: {}, sql: {} } as never),
    );
  });

  it("authorizes project and environment read scopes before listing", async () => {
    const events: string[] = [];
    vi.mocked(authorizeScopeOrThrow).mockImplementation(async (input) => {
      events.push(input.requiredScope);
    });
    listByProject.mockResolvedValue([]);

    const input: ListEnvironmentsRpcInput = {
      organizationId: organization,
      projectId: project,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      listEnvironmentsOperation({
        input,
        auditActor: { type: "user", userId: actorUserId },
        accessActor: { type: "user", userId: actorUserId },
      }),
    ).resolves.toEqual({ environments: [] });

    expect(events).toEqual([
      AUTHORIZATION_SCOPES.projectRead,
      AUTHORIZATION_SCOPES.environmentRead,
    ]);
  });

  it("returns metadata-only environment rows including isProtected", async () => {
    listByProject.mockResolvedValue([
      {
        environmentId: "env_00000000000000000000000001",
        organizationId: organization,
        projectId: project,
        displayName: "Production",
        lifecycleStage: "production",
        isProtected: true,
        previewNonProductionOptDown: null,
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
      },
    ]);

    const result = await listEnvironmentsOperation({
      input: {
        organizationId: organization,
        projectId: project,
        actorToken: "verified-by-rpc-entry",
        requestId: request,
      },
      auditActor: { type: "user", userId: actorUserId },
      accessActor: { type: "user", userId: actorUserId },
    });

    expect(result.environments[0]).toMatchObject({
      lifecycleStage: "production",
      isProtected: true,
      createdAt: "2026-06-24T00:00:00.000Z",
    });
    expect(TenantEnvironmentLifecycleStore).toHaveBeenCalled();
  });
});
