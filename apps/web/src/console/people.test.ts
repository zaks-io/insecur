import { describe, expect, it } from "vitest";
import { parseOrgInvitationsBody, parseOrgMembersBody } from "./people.js";

const member = {
  membershipId: "mem_01JZ8EDQ2R7V0X3Z6C9D1F4G5H",
  userId: "usr_01JZ8EDQ2R7V0X3Z6C9D1F4G5H",
  displayName: "Grace Hopper",
  rolePreset: "owner",
  projectId: null,
  createdAt: "2026-07-01T12:34:56.000Z",
};

const invitation = {
  invitationId: "inv_01JZ8E4R2P7M9N3K5T8V1X6Z0A",
  inviteeUserId: "usr_01JZ8E4R2P7M9N3K5T8V1X6Z0A",
  inviteeDisplayName: null,
  rolePreset: "developer",
  status: "pending",
  projectId: null,
  createdAt: "2026-07-02T00:00:00.000Z",
};

describe("parseOrgMembersBody", () => {
  it("parses the success envelope into metadata-only member rows", () => {
    const parsed = parseOrgMembersBody({ ok: true, data: { members: [member] } });
    expect(parsed).toEqual([member]);
  });

  it("accepts a null display name and a project-scoped membership", () => {
    const projectScoped = {
      ...member,
      displayName: null,
      projectId: "prj_01JZ8EDQ2R7V0X3Z6C9D1F4G5H",
    };
    expect(parseOrgMembersBody({ ok: true, data: { members: [projectScoped] } })).toEqual([
      projectScoped,
    ]);
  });

  it("parses an empty members list (a valid authorized read)", () => {
    expect(parseOrgMembersBody({ ok: true, data: { members: [] } })).toEqual([]);
  });

  it("fails closed on error envelopes so denial reads as nonexistence", () => {
    expect(
      parseOrgMembersBody({ ok: false, error: { code: "auth.insufficient_scope" } }),
    ).toBeNull();
    expect(parseOrgMembersBody(undefined)).toBeNull();
    expect(parseOrgMembersBody({ ok: true, data: {} })).toBeNull();
  });

  it("fails closed when any entry is malformed rather than returning a partial list", () => {
    expect(
      parseOrgMembersBody({ ok: true, data: { members: [member, { membershipId: 7 }] } }),
    ).toBeNull();
  });
});

describe("parseOrgInvitationsBody", () => {
  it("parses pending invitation rows", () => {
    const parsed = parseOrgInvitationsBody({ ok: true, data: { invitations: [invitation] } });
    expect(parsed).toEqual([invitation]);
  });

  it("parses an empty invitations list (the common state)", () => {
    expect(parseOrgInvitationsBody({ ok: true, data: { invitations: [] } })).toEqual([]);
  });

  it("fails closed on any status other than pending", () => {
    expect(
      parseOrgInvitationsBody({
        ok: true,
        data: { invitations: [{ ...invitation, status: "accepted" }] },
      }),
    ).toBeNull();
  });

  it("fails closed on error envelopes and malformed bodies", () => {
    expect(parseOrgInvitationsBody({ ok: false, error: { code: "auth.required" } })).toBeNull();
    expect(parseOrgInvitationsBody(null)).toBeNull();
    expect(parseOrgInvitationsBody({ ok: true, data: { invitations: [{}] } })).toBeNull();
  });
});
