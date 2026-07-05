import { loadUserOrganizations, type MachineActorRef } from "@insecur/access";
import { AUTH_ERROR_CODES, machineIdentityId, userId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { listSessionOrganizationsOperation } from "./list-session-organizations-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    loadUserOrganizations: vi.fn(),
  };
});

const actorUserId = userId.generate();

describe("listSessionOrganizationsOperation", () => {
  it("returns the actor's organizations from the memberships read", async () => {
    const organizations = [
      { organizationId: "org_00000000000000000000000001", displayName: "Acme Corp" },
    ];
    vi.mocked(loadUserOrganizations).mockResolvedValue(organizations as never);

    await expect(
      listSessionOrganizationsOperation({ accessActor: { type: "user", userId: actorUserId } }),
    ).resolves.toEqual({ organizations });

    expect(loadUserOrganizations).toHaveBeenCalledWith(actorUserId);
  });

  it("rejects machine actors: there is no machine console session", async () => {
    const machineActor = {
      type: "machine",
      machineIdentityId: machineIdentityId.generate(),
    } as MachineActorRef;

    await expect(
      listSessionOrganizationsOperation({ accessActor: machineActor }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });
});
