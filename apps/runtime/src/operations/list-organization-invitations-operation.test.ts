import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow } from "@insecur/access";
import { invitationId, organizationId, requestId, userId } from "@insecur/domain";
import { listPendingInvitations } from "@insecur/onboarding";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listOrganizationInvitationsOperation,
  type ListOrganizationInvitationsOperationInput,
} from "./list-organization-invitations-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    authorizeScopeOrThrow: vi.fn(),
  };
});

vi.mock("@insecur/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/onboarding")>();
  return {
    ...actual,
    listPendingInvitations: vi.fn(),
  };
});

const organization = organizationId.generate();
const request = requestId.generate();
const invitation = invitationId.generate();
const invitee = userId.generate();

const auditActor: ListOrganizationInvitationsOperationInput["auditActor"] = {
  type: "user",
  userId: userId.generate(),
};
const accessActor: ListOrganizationInvitationsOperationInput["accessActor"] = {
  type: "user",
  userId: auditActor.userId,
};

describe("listOrganizationInvitationsOperation", () => {
  beforeEach(() => {
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(listPendingInvitations).mockReset();
  });

  it("authorizes organization:read before listing, then maps rows to the metadata envelope", async () => {
    const events: string[] = [];
    vi.mocked(authorizeScopeOrThrow).mockImplementation(async () => {
      events.push("authorize");
    });
    vi.mocked(listPendingInvitations).mockImplementation(async () => {
      events.push("read");
      return [
        {
          invitationId: invitation,
          organizationId: organization,
          inviteeUserId: invitee,
          inviteeDisplayName: null,
          rolePreset: "developer",
          projectId: null,
          status: "pending",
          createdAt: new Date("2026-07-02T08:30:00.000Z"),
        },
      ];
    });

    const payload = await listOrganizationInvitationsOperation({
      input: {
        organizationId: organization,
        actorToken: "verified-by-rpc-entry",
        requestId: request,
      },
      auditActor,
      accessActor,
    });

    expect(events).toEqual(["authorize", "read"]);
    expect(authorizeScopeOrThrow).toHaveBeenCalledWith({
      actor: accessActor,
      auditActor,
      coordinate: { organizationId: organization },
      requiredScope: AUTHORIZATION_SCOPES.organizationRead,
      requestId: request,
    });
    expect(payload.invitations).toEqual([
      {
        invitationId: invitation,
        organizationId: organization,
        inviteeUserId: invitee,
        inviteeDisplayName: null,
        rolePreset: "developer",
        status: "pending",
        projectId: null,
        createdAt: "2026-07-02T08:30:00.000Z",
      },
    ]);
  });

  it("never lists when authorization denies, so denial stays metadata-safe", async () => {
    vi.mocked(authorizeScopeOrThrow).mockRejectedValue(
      Object.assign(new Error("Missing required permission."), {
        code: "auth.insufficient_scope",
      }),
    );

    await expect(
      listOrganizationInvitationsOperation({
        input: {
          organizationId: organization,
          actorToken: "verified-by-rpc-entry",
          requestId: request,
        },
        auditActor,
        accessActor,
      }),
    ).rejects.toMatchObject({ code: "auth.insufficient_scope" });

    expect(listPendingInvitations).not.toHaveBeenCalled();
  });
});
