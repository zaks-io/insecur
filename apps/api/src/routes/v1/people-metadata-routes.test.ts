import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  invitationId,
  membershipId,
  organizationId,
  parseDisplayName,
  userId,
  type DisplayName,
} from "@insecur/domain";
import type { KnownErrorCode } from "@insecur/domain";
import type { RuntimeRpcResult } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createRuntimeRpcStub,
  type RuntimeRpcStub,
} from "../../../test/support/runtime-rpc-stub.js";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";

import app from "../../index.js";

const admittedUserId = userId.brand(ADMITTED_USER_ID_RAW);
const workosUserId = WORKOS_USER_ID;

const orgId = organizationId.brand("org_00000000000000000000000011");
const otherOrgId = organizationId.brand("org_00000000000000000000000012");

let runtime: RuntimeRpcStub;

function makeEnv() {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    INSTANCE_ID: "inst_LOCAL_DEV",
    RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
    RUNTIME: runtime,
  };
}

const membersPath = `/v1/orgs/${orgId}/members`;
const invitationsPath = `/v1/orgs/${orgId}/invitations`;

function testDisplayName(raw: string): DisplayName {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`invalid fixture display name: ${raw}`);
  }
  return parsed.value;
}

const metadataOnlyMember = {
  membershipId: membershipId.brand("mem_00000000000000000000000011"),
  organizationId: orgId,
  userId: userId.brand("usr_00000000000000000000000011"),
  displayName: testDisplayName("Synthetic member"),
  rolePreset: "owner",
  projectId: null,
  createdAt: "2026-07-01T00:00:00.000Z",
};

const metadataOnlyInvitation = {
  invitationId: invitationId.brand("inv_00000000000000000000000011"),
  organizationId: orgId,
  inviteeUserId: userId.brand("usr_00000000000000000000000012"),
  inviteeDisplayName: null,
  rolePreset: "developer",
  status: "pending" as const,
  projectId: null,
  createdAt: "2026-07-02T00:00:00.000Z",
};

function rpcFailure(
  code: KnownErrorCode,
  message: string,
  retryable = false,
): RuntimeRpcResult<never> {
  return { ok: false, error: { code, message, retryable } };
}

async function authHeaders(env: ReturnType<typeof makeEnv>): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_people_metadata_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

describe("people metadata worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.listOrganizationMembers.mockResolvedValue({
      ok: true,
      value: { members: [metadataOnlyMember] },
    });
    runtime.listOrganizationInvitations.mockResolvedValue({
      ok: true,
      value: { invitations: [metadataOnlyInvitation] },
    });
  });

  describe("GET /v1/orgs/:organizationId/members", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(membersPath, { method: "GET" }, env);

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
      expect(runtime.listOrganizationMembers).not.toHaveBeenCalled();
    });

    it("forwards the read to the Runtime Worker and returns metadata-only member rows", async () => {
      const env = makeEnv();
      const response = await app.request(
        membersPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.listOrganizationMembers).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgId }),
      );
      const forwarded = runtime.listOrganizationMembers.mock.calls[0]?.[0];
      expect(forwarded?.actorToken.length).toBeGreaterThan(0);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { members: [metadataOnlyMember] },
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/email|slug|valueUtf8|plaintext|secret|password/i);
    });

    it("returns an empty members array untouched", async () => {
      const env = makeEnv();
      runtime.listOrganizationMembers.mockResolvedValue({ ok: true, value: { members: [] } });

      const response = await app.request(
        membersPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { members: [] } });
    });

    it("maps non-member and low-scope denials to one auth.insufficient_scope shape", async () => {
      const env = makeEnv();
      runtime.listOrganizationMembers.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "Missing required permission."),
      );

      const response = await app.request(
        membersPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(403);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
    });

    it("tenant-qualifies cross-tenant reads through the Runtime seam", async () => {
      const env = makeEnv();
      runtime.listOrganizationMembers.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "Missing required permission."),
      );

      const response = await app.request(
        `/v1/orgs/${otherOrgId}/members`,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(403);
      expect(runtime.listOrganizationMembers).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: otherOrgId }),
      );
    });
  });

  describe("GET /v1/orgs/:organizationId/invitations", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(invitationsPath, { method: "GET" }, env);

      expect(response.status).toBe(401);
      expect(runtime.listOrganizationInvitations).not.toHaveBeenCalled();
    });

    it("forwards the read and returns pending invitation metadata with no acceptance material", async () => {
      const env = makeEnv();
      const response = await app.request(
        invitationsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.listOrganizationInvitations).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgId }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { invitations: [metadataOnlyInvitation] },
      });
      const { invitations } = (body as { data: { invitations: Record<string, unknown>[] } }).data;
      // The envelope is closed: identifiers, role bundle, status, timestamp — nothing else.
      expect(Object.keys(invitations[0] ?? {}).sort()).toEqual([
        "createdAt",
        "invitationId",
        "inviteeDisplayName",
        "inviteeUserId",
        "organizationId",
        "projectId",
        "rolePreset",
        "status",
      ]);
      const serialized = JSON.stringify(body);
      expect(serialized).not.toMatch(/token|secret|accept|email|password|link/i);
    });

    it("returns an empty invitations array untouched", async () => {
      const env = makeEnv();
      runtime.listOrganizationInvitations.mockResolvedValue({
        ok: true,
        value: { invitations: [] },
      });

      const response = await app.request(
        invitationsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { invitations: [] } });
    });

    it("maps denials to auth.insufficient_scope without leaking existence", async () => {
      const env = makeEnv();
      runtime.listOrganizationInvitations.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "Missing required permission."),
      );

      const response = await app.request(
        invitationsPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(403);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
    });
  });
});
