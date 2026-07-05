import {
  AUTHORIZATION_SCOPES,
  assertOrganizationMembership,
  hasAuthorizationScope,
  resolveEffectiveAccessBatch,
} from "@insecur/access";
import { AUTH_ERROR_CODES, organizationId, projectId, requestId, userId } from "@insecur/domain";
import { TenantProjectMetadataStore, withTenantScope } from "@insecur/tenant-store";
import type { ListProjectsRpcInput } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listProjectsOperation } from "./list-projects-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    assertOrganizationMembership: vi.fn(),
    resolveEffectiveAccessBatch: vi.fn(),
    hasAuthorizationScope: vi.fn(),
  };
});

const { listByOrganization } = vi.hoisted(() => ({
  listByOrganization: vi.fn(),
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    TenantProjectMetadataStore: vi.fn(function MockTenantProjectMetadataStore() {
      return { listByOrganization };
    }),
  };
});

const organization = organizationId.brand("org_00000000000000000000000001");
const readableProject = projectId.brand("prj_00000000000000000000000001");
const unreadableProject = projectId.brand("prj_00000000000000000000000002");
const request = requestId.generate();
const actorUserId = userId.generate();

describe("listProjectsOperation", () => {
  beforeEach(() => {
    vi.mocked(assertOrganizationMembership).mockReset();
    vi.mocked(resolveEffectiveAccessBatch).mockReset();
    vi.mocked(hasAuthorizationScope).mockReset();
    vi.mocked(withTenantScope).mockReset();
    listByOrganization.mockReset();
    vi.mocked(assertOrganizationMembership).mockResolvedValue(undefined);
    vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) =>
      fn({ db: {}, sql: {} } as never),
    );
  });

  it("returns an empty list without scope checks when the org has no projects", async () => {
    listByOrganization.mockResolvedValue([]);

    const input: ListProjectsRpcInput = {
      organizationId: organization,
      actorToken: "verified-by-rpc-entry",
      requestId: request,
    };

    await expect(
      listProjectsOperation({
        input,
        auditActor: { type: "user", userId: actorUserId },
        accessActor: { type: "user", userId: actorUserId },
      }),
    ).resolves.toEqual({ projects: [] });

    expect(resolveEffectiveAccessBatch).not.toHaveBeenCalled();
    expect(TenantProjectMetadataStore).toHaveBeenCalled();
  });

  it("filters projects to coordinates with project:read", async () => {
    const createdAt = new Date("2026-06-24T00:00:00.000Z");
    listByOrganization.mockResolvedValue([
      {
        projectId: readableProject,
        organizationId: organization,
        displayName: "Readable",
        createdAt,
      },
      {
        projectId: unreadableProject,
        organizationId: organization,
        displayName: "Unreadable",
        createdAt,
      },
    ]);
    vi.mocked(resolveEffectiveAccessBatch).mockResolvedValue([
      { organizationId: organization, scopes: [AUTHORIZATION_SCOPES.projectRead] },
      { organizationId: organization, scopes: [] },
    ]);
    vi.mocked(hasAuthorizationScope).mockImplementation((effectiveAccess, scope) =>
      effectiveAccess.scopes.includes(scope),
    );

    const result = await listProjectsOperation({
      input: {
        organizationId: organization,
        actorToken: "verified-by-rpc-entry",
        requestId: request,
      },
      auditActor: { type: "user", userId: actorUserId },
      accessActor: { type: "user", userId: actorUserId },
    });

    expect(result.projects).toEqual([
      {
        projectId: readableProject,
        organizationId: organization,
        displayName: "Readable",
        createdAt: "2026-06-24T00:00:00.000Z",
      },
    ]);
  });

  it("denies when the org has projects but none are readable", async () => {
    listByOrganization.mockResolvedValue([
      {
        projectId: unreadableProject,
        organizationId: organization,
        displayName: "Unreadable",
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
      },
    ]);
    vi.mocked(resolveEffectiveAccessBatch).mockResolvedValue([
      { organizationId: organization, scopes: [] },
    ]);
    vi.mocked(hasAuthorizationScope).mockReturnValue(false);

    await expect(
      listProjectsOperation({
        input: {
          organizationId: organization,
          actorToken: "verified-by-rpc-entry",
          requestId: request,
        },
        auditActor: { type: "user", userId: actorUserId },
        accessActor: { type: "user", userId: actorUserId },
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });
});
