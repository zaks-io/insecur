import { userId } from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadUserOrganizations, mapUserOrganizationRow } from "../src/load-user-organizations.js";

const { sqlMock } = vi.hoisted(() => ({ sqlMock: vi.fn() }));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
  };
});

const actorUserId = userId.brand("usr_00000000000000000000000001");

describe("mapUserOrganizationRow", () => {
  it("brands the organization id and parses the display name", () => {
    const row = mapUserOrganizationRow({
      org_id: "org_00000000000000000000000001",
      display_name: "Acme Corp",
    });
    expect(row).toEqual({
      organizationId: "org_00000000000000000000000001",
      displayName: "Acme Corp",
    });
  });

  it("fails loudly on an invalid stored display name", () => {
    expect(() =>
      mapUserOrganizationRow({ org_id: "org_00000000000000000000000001", display_name: "   " }),
    ).toThrow(/invalid stored display name/);
  });
});

describe("loadUserOrganizations", () => {
  beforeEach(() => {
    vi.mocked(withTenantScope).mockReset();
    sqlMock.mockReset();
    vi.mocked(withTenantScope).mockImplementation(async (_scope, fn) =>
      fn({ db: {}, sql: sqlMock } as never),
    );
  });

  it("runs under service scope and maps the returned rows", async () => {
    sqlMock.mockResolvedValue([
      { org_id: "org_00000000000000000000000001", display_name: "Acme Corp" },
      { org_id: "org_00000000000000000000000002", display_name: "Beta LLC" },
    ]);

    const organizations = await loadUserOrganizations(actorUserId);

    expect(vi.mocked(withTenantScope).mock.calls[0]?.[0]).toEqual({ kind: "service" });
    expect(organizations).toEqual([
      { organizationId: "org_00000000000000000000000001", displayName: "Acme Corp" },
      { organizationId: "org_00000000000000000000000002", displayName: "Beta LLC" },
    ]);
  });

  it("returns an empty list for an actor with no memberships", async () => {
    sqlMock.mockResolvedValue([]);
    await expect(loadUserOrganizations(actorUserId)).resolves.toEqual([]);
  });
});
