import {
  AUTHORIZATION_SCOPES,
  authorizeScopeOrThrow,
  loadOrganizationMembers,
} from "@insecur/access";
import { membershipId, organizationId, parseDisplayName, requestId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listOrganizationMembersOperation,
  type ListOrganizationMembersOperationInput,
} from "./list-organization-members-operation.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    authorizeScopeOrThrow: vi.fn(),
    loadOrganizationMembers: vi.fn(),
  };
});

const organization = organizationId.generate();
const request = requestId.generate();
const memberUserId = userId.generate();
const membership = membershipId.generate();

const auditActor: ListOrganizationMembersOperationInput["auditActor"] = {
  type: "user",
  userId: userId.generate(),
};
const accessActor: ListOrganizationMembersOperationInput["accessActor"] = {
  type: "user",
  userId: auditActor.userId,
};

function testDisplayName(raw: string) {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

describe("listOrganizationMembersOperation", () => {
  beforeEach(() => {
    vi.mocked(authorizeScopeOrThrow).mockReset();
    vi.mocked(loadOrganizationMembers).mockReset();
  });

  it("authorizes organization:read before reading, then maps rows to the metadata envelope", async () => {
    const events: string[] = [];
    vi.mocked(authorizeScopeOrThrow).mockImplementation(async () => {
      events.push("authorize");
    });
    vi.mocked(loadOrganizationMembers).mockImplementation(async () => {
      events.push("read");
      return [
        {
          membershipId: membership,
          organizationId: organization,
          userId: memberUserId,
          displayName: testDisplayName("Ada Lovelace"),
          rolePreset: "owner",
          projectId: null,
          createdAt: new Date("2026-07-01T12:00:00.000Z"),
        },
      ];
    });

    const payload = await listOrganizationMembersOperation({
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
    expect(payload.members).toEqual([
      {
        membershipId: membership,
        organizationId: organization,
        userId: memberUserId,
        displayName: "Ada Lovelace",
        rolePreset: "owner",
        projectId: null,
        createdAt: "2026-07-01T12:00:00.000Z",
      },
    ]);
  });

  it("never reads when authorization denies, so denial stays metadata-safe", async () => {
    vi.mocked(authorizeScopeOrThrow).mockRejectedValue(
      Object.assign(new Error("Missing required permission."), {
        code: "auth.insufficient_scope",
      }),
    );

    await expect(
      listOrganizationMembersOperation({
        input: {
          organizationId: organization,
          actorToken: "verified-by-rpc-entry",
          requestId: request,
        },
        auditActor,
        accessActor,
      }),
    ).rejects.toMatchObject({ code: "auth.insufficient_scope" });

    expect(loadOrganizationMembers).not.toHaveBeenCalled();
  });
});
