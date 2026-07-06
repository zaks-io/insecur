import { organizationId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadOrganizationMembers } from "../src/load-organization-members.js";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
  };
});

const orgId = organizationId.brand("org_00000000000000000000000001");

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem_00000000000000000000000001",
    org_id: orgId,
    user_id: "usr_00000000000000000000000001",
    role_preset: "owner",
    project_id: null,
    created_at: "2026-07-01T12:00:00.000Z",
    display_name: "Ada Lovelace",
    ...overrides,
  };
}

describe("loadOrganizationMembers", () => {
  beforeEach(() => {
    vi.mocked(withTenantScope).mockReset();
    sqlMock.mockReset();
    vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) =>
      fn({ db: {}, sql: sqlMock } as never),
    );
  });

  it("runs org-scoped and maps rows to branded metadata with a parsed Date", async () => {
    sqlMock.mockResolvedValue([rawRow()]);

    const members = await loadOrganizationMembers(orgId);

    expect(vi.mocked(withTenantScope).mock.calls[0]?.[0]).toEqual({
      kind: "organization",
      organizationId: orgId,
    });
    expect(members).toEqual([
      {
        membershipId: "mem_00000000000000000000000001",
        organizationId: orgId,
        userId: "usr_00000000000000000000000001",
        displayName: "Ada Lovelace",
        rolePreset: "owner",
        projectId: null,
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
      },
    ]);
  });

  it("maps a missing or unparseable admission display name to null", async () => {
    sqlMock.mockResolvedValue([
      rawRow({ display_name: null }),
      rawRow({ id: "mem_00000000000000000000000002", display_name: "   " }),
    ]);

    const members = await loadOrganizationMembers(orgId);

    expect(members.map((member) => member.displayName)).toEqual([null, null]);
  });

  it("brands a project-tier membership's project id", async () => {
    sqlMock.mockResolvedValue([rawRow({ project_id: "prj_00000000000000000000000001" })]);

    const members = await loadOrganizationMembers(orgId);

    expect(members[0]?.projectId).toBe("prj_00000000000000000000000001");
  });

  it("returns an empty list for an organization with no membership rows", async () => {
    sqlMock.mockResolvedValue([]);
    await expect(loadOrganizationMembers(orgId)).resolves.toEqual([]);
  });
});
