import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import { parseOrgInvitationsBody, parseOrgMembersBody } from "../src/console/people.js";
import {
  FAKE_ADMITTED_USER_ID,
  FAKE_SEALED_SESSION,
  FAKE_WORKOS_USER_ID,
} from "./support/fake-browser-session.js";
import {
  createFakeApiBinding,
  createFakeRuntimeAdmissionBinding,
  createFakeWebEnv,
} from "./support/fake-web-env.js";
import { ssrRequest } from "./support/ssr-request.js";

// People section read over the INS-369 harness: session cookie -> Runtime admission ->
// scoped-token API hop -> members + invitations parses, exactly the seam the /orgs/$orgId/people
// loader composes through loadOrgPeople.
vi.mock("../src/auth/workos-port.js", async () => {
  const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
  const { fakeSessionEntry } = await import("./support/fake-browser-session.js");
  return {
    createWorkOSSessionPortFromEnv: () => createFakeWorkOSSessionPort([fakeSessionEntry()]),
  };
});
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: () => undefined,
}));

const ORG_ID = "org_01JZ8E2QYQAAAAAAAAAAAAAAAA";
const PEOPLE_PATH = `/orgs/${ORG_ID}/people`;

// Console shape: the parser keeps exactly these fields and drops the envelope's organizationId.
const MEMBER = {
  membershipId: "mem_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
  userId: "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
  displayName: "Acme Owner",
  rolePreset: "owner",
  projectId: null,
  createdAt: "2026-07-01T00:00:00.000Z",
};

const INVITATION = {
  invitationId: "inv_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
  inviteeUserId: "usr_01JZ8E2QYQ7M7F4K9A2B3C4D5E",
  inviteeDisplayName: null,
  rolePreset: "developer",
  status: "pending",
  projectId: null,
  createdAt: "2026-07-02T00:00:00.000Z",
};

const MEMBER_ENVELOPE_ROW = { ...MEMBER, organizationId: ORG_ID };
const INVITATION_ENVELOPE_ROW = { ...INVITATION, organizationId: ORG_ID };

async function authedApiClient(handlers: Parameters<typeof createFakeApiBinding>[0]) {
  const { runtime } = createFakeRuntimeAdmissionBinding({
    [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
  });
  const { api, calls } = createFakeApiBinding(handlers);
  const env = createFakeWebEnv({ RUNTIME: runtime, API: api });

  const resolved = await resolveBrowserActor(
    ssrRequest(PEOPLE_PATH, { sessionCookie: FAKE_SEALED_SESSION }),
    env,
  );
  if (!resolved.ok) {
    throw new Error("expected the fake session to resolve");
  }
  return { client: apiClientFor(env, resolved.actor), calls };
}

describe("people section read over the BFF seam", () => {
  it("reads members and pending invitations metadata for an authorized member", async () => {
    const { client, calls } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/members`]: () =>
        Response.json({ ok: true, data: { members: [MEMBER_ENVELOPE_ROW] } }),
      [`/v1/orgs/${ORG_ID}/invitations`]: () =>
        Response.json({ ok: true, data: { invitations: [INVITATION_ENVELOPE_ROW] } }),
    });

    const members = parseOrgMembersBody(await client.orgMembers(ORG_ID));
    const invitations = parseOrgInvitationsBody(await client.orgInvitations(ORG_ID));

    expect(members).toEqual([MEMBER]);
    expect(invitations).toEqual([INVITATION]);

    // Both hops carry only the server-minted scoped bearer; no browser cookie crosses them.
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.headers.get("Authorization")).toMatch(/^Bearer /u);
      expect(call.headers.get("Cookie")).toBeNull();
    }

    // Metadata-only console rows: identifiers, role bundle, status, timestamps. Nothing else.
    expect(Object.keys(invitations?.[0] ?? {}).sort()).toEqual([
      "createdAt",
      "invitationId",
      "inviteeDisplayName",
      "inviteeUserId",
      "projectId",
      "rolePreset",
      "status",
    ]);
    expect(Object.keys(members?.[0] ?? {}).sort()).toEqual([
      "createdAt",
      "displayName",
      "membershipId",
      "projectId",
      "rolePreset",
      "userId",
    ]);
  });

  it("fails closed on a non-member denial: the error envelope parses to null, like nonexistence", async () => {
    const { client } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/members`]: () =>
        Response.json({ ok: false, error: { code: "auth.insufficient_scope" } }, { status: 403 }),
      [`/v1/orgs/${ORG_ID}/invitations`]: () =>
        Response.json({ ok: false, error: { code: "auth.insufficient_scope" } }, { status: 403 }),
    });

    expect(parseOrgMembersBody(await client.orgMembers(ORG_ID))).toBeNull();
    expect(parseOrgInvitationsBody(await client.orgInvitations(ORG_ID))).toBeNull();
  });

  it("parses empty lists as valid authorized reads (the empty-state render path)", async () => {
    const { client } = await authedApiClient({
      [`/v1/orgs/${ORG_ID}/members`]: () => Response.json({ ok: true, data: { members: [] } }),
      [`/v1/orgs/${ORG_ID}/invitations`]: () =>
        Response.json({ ok: true, data: { invitations: [] } }),
    });

    expect(parseOrgMembersBody(await client.orgMembers(ORG_ID))).toEqual([]);
    expect(parseOrgInvitationsBody(await client.orgInvitations(ORG_ID))).toEqual([]);
  });
});
