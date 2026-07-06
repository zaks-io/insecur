import { organizationId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listPendingInvitations } from "../src/list-pending-invitations.js";

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
    id: "inv_00000000000000000000000001",
    org_id: orgId,
    invitee_user_id: "usr_00000000000000000000000002",
    role_preset: "developer",
    project_id: null,
    created_at: "2026-07-02T08:30:00.000Z",
    display_name: "Invited Dev",
    ...overrides,
  };
}

describe("listPendingInvitations", () => {
  beforeEach(() => {
    vi.mocked(withTenantScope).mockReset();
    sqlMock.mockReset();
    vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) =>
      fn({ db: {}, sql: sqlMock } as never),
    );
  });

  it("runs org-scoped and maps rows to the metadata-only pending shape", async () => {
    sqlMock.mockResolvedValue([rawRow()]);

    const invitations = await listPendingInvitations(orgId);

    expect(vi.mocked(withTenantScope).mock.calls[0]?.[0]).toEqual({
      kind: "organization",
      organizationId: orgId,
    });
    expect(invitations).toEqual([
      {
        invitationId: "inv_00000000000000000000000001",
        organizationId: orgId,
        inviteeUserId: "usr_00000000000000000000000002",
        inviteeDisplayName: "Invited Dev",
        rolePreset: "developer",
        projectId: null,
        status: "pending",
        createdAt: new Date("2026-07-02T08:30:00.000Z"),
      },
    ]);
  });

  it("maps a missing or unparseable invitee display name to null", async () => {
    sqlMock.mockResolvedValue([
      rawRow({ display_name: null }),
      rawRow({ id: "inv_00000000000000000000000002", display_name: "   " }),
    ]);

    const invitations = await listPendingInvitations(orgId);

    expect(invitations.map((invitation) => invitation.inviteeDisplayName)).toEqual([null, null]);
  });

  it("fails loudly on an invalid stored role preset", async () => {
    sqlMock.mockResolvedValue([rawRow({ role_preset: "superuser" })]);

    await expect(listPendingInvitations(orgId)).rejects.toThrow(/invalid built-in role preset/);
  });

  it("returns an empty list when the organization has no pending invitations", async () => {
    sqlMock.mockResolvedValue([]);
    await expect(listPendingInvitations(orgId)).resolves.toEqual([]);
  });
});
