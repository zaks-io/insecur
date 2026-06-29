import { mintEphemeralSessionCredential, testSessionSigningSecret } from "@insecur/auth";
import {
  AUTH_ERROR_CODES,
  invitationId,
  membershipId,
  ONBOARDING_ERROR_CODES,
  organizationId,
  projectId,
  teamId,
  userId,
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
const inviteeUserId = userId.brand("usr_00000000000000000000000071");

const orgId = organizationId.brand("org_00000000000000000000000001");
const otherOrgId = organizationId.brand("org_00000000000000000000000002");
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const invitationIdValue = invitationId.brand("inv_00000000000000000000000071");
const grantedMembershipId = membershipId.brand("mem_00000000000000000000000080");
const operatorOrgId = organizationId.brand("org_00000000000000000000000099");
const operatorTeamId = teamId.brand("team_00000000000000000000000099");

let runtime: RuntimeRpcStub;

function makeEnvWithoutInstanceId() {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
    RUNTIME: runtime,
  };
}

const INSTANCE_ID = "inst_MEMBERSHIP_TEST";

function makeEnv() {
  return { ...makeEnvWithoutInstanceId(), INSTANCE_ID };
}

const createInvitationPath = `/v1/orgs/${orgId}/invitations`;
const acceptInvitationPath = `/v1/orgs/${orgId}/invitations/${invitationIdValue}/accept`;
const crossTenantCreatePath = `/v1/orgs/${otherOrgId}/invitations`;
const crossTenantAcceptPath = `/v1/orgs/${otherOrgId}/invitations/${invitationIdValue}/accept`;
const createOrganizationPath = `/v1/orgs/${orgId}/organizations`;

const invitationCreated = {
  invitationId: invitationIdValue,
  organizationId: orgId,
  teamId: teamId.brand("team_00000000000000000000000001"),
  inviteeUserId,
  rolePreset: "developer" as const,
  projectId: projectIdValue,
};

const invitationAccepted = {
  invitationId: invitationIdValue,
  membershipId: grantedMembershipId,
  organizationId: orgId,
};

const operatorOrganizationCreated = {
  organizationId: operatorOrgId,
  defaultTeamId: operatorTeamId,
};

function rpcFailure(
  code: KnownErrorCode,
  message: string,
  retryable = false,
): RuntimeRpcResult<never> {
  return { ok: false, error: { code, message, retryable } };
}

async function authHeaders(env: {
  SESSION_SIGNING_SECRET: string;
}): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_membership_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
    "Content-Type": "application/json",
  };
}

describe("membership management worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.createInvitation.mockResolvedValue({ ok: true, value: invitationCreated });
    runtime.acceptInvitation.mockResolvedValue({ ok: true, value: invitationAccepted });
    runtime.createOperatorOrganization.mockResolvedValue({
      ok: true,
      value: operatorOrganizationCreated,
    });
  });

  describe("POST /v1/orgs/:organizationId/invitations", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(
        createInvitationPath,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inviteeUserId,
            rolePreset: "developer",
            projectId: projectIdValue,
          }),
        },
        env,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: "auth.required" } });
      expect(runtime.createInvitation).not.toHaveBeenCalled();
    });

    it("rejects missing inviteeUserId before forwarding invitation creation", async () => {
      const env = makeEnv();
      const response = await app.request(
        createInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({
            rolePreset: "developer",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.createInvitation).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });

    it("rejects invalid inviteeUserId values", async () => {
      const env = makeEnv();
      const response = await app.request(
        createInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({
            inviteeUserId: "not-a-user",
            rolePreset: "developer",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.createInvitation).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });

    it("rejects invalid optional projectId values", async () => {
      const env = makeEnv();
      const response = await app.request(
        createInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({
            inviteeUserId,
            rolePreset: "developer",
            projectId: "not-a-project",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.createInvitation).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });

    it("rejects invalid organization path params", async () => {
      const env = makeEnv();
      const response = await app.request(
        `/v1/orgs/not-an-org/invitations`,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({
            inviteeUserId,
            rolePreset: "developer",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.createInvitation).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });

    it("forwards invitation creation to the Runtime Worker with a hop token", async () => {
      const env = makeEnv();
      const response = await app.request(
        createInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({
            inviteeUserId,
            rolePreset: "developer",
            projectId: projectIdValue,
          }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          inviteeUserId,
          rolePreset: "developer",
          projectId: projectIdValue,
        }),
      );
      const forwarded = runtime.createInvitation.mock.calls[0]?.[0];
      expect(forwarded?.actorToken.length).toBeGreaterThan(0);
      expect(forwarded).not.toHaveProperty("actor");
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { invitationId: invitationIdValue, organizationId: orgId },
      });
      expect(JSON.stringify(body)).not.toMatch(/token|secret|password/i);
    });

    it("maps Runtime membership-management errors to stable envelopes", async () => {
      const env = makeEnv();
      runtime.createInvitation.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "membership management scope required"),
      );

      const response = await app.request(
        createInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({
            inviteeUserId,
            rolePreset: "developer",
          }),
        },
        env,
      );

      expect(response.status).toBe(403);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
      expect(JSON.stringify(body)).not.toContain("membership management scope required");
    });

    it("tenant-qualifies cross-tenant invitation creation through the Runtime seam", async () => {
      const env = makeEnv();
      runtime.createInvitation.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "membership management scope required"),
      );

      const response = await app.request(
        crossTenantCreatePath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({
            inviteeUserId,
            rolePreset: "developer",
          }),
        },
        env,
      );

      expect(response.status).toBe(403);
      expect(runtime.createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: otherOrgId }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
    });
  });

  describe("POST /v1/orgs/:organizationId/invitations/:invitationId/accept", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(
        acceptInvitationPath,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
        env,
      );

      expect(response.status).toBe(401);
      expect(runtime.acceptInvitation).not.toHaveBeenCalled();
    });

    it("rejects invalid invitation id path params", async () => {
      const env = makeEnv();
      const response = await app.request(
        `/v1/orgs/${orgId}/invitations/not-an-invitation/accept`,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: "{}",
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.acceptInvitation).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });

    it("forwards acceptance to the Runtime Worker with a hop token", async () => {
      const env = makeEnv();
      const response = await app.request(
        acceptInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({ membershipId: grantedMembershipId }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.acceptInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          invitationId: invitationIdValue,
          organizationId: orgId,
          membershipId: grantedMembershipId,
        }),
      );
      const forwarded = runtime.acceptInvitation.mock.calls[0]?.[0];
      expect(forwarded?.actorToken.length).toBeGreaterThan(0);
      expect(forwarded).not.toHaveProperty("acceptingUserId");
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { membershipId: grantedMembershipId, organizationId: orgId },
      });
    });

    it("maps invitation replay to onboarding.invitation_not_pending without leaking details", async () => {
      const env = makeEnv();
      runtime.acceptInvitation.mockResolvedValue(
        rpcFailure(ONBOARDING_ERROR_CODES.invitationNotPending, "invitation is not pending"),
      );

      const response = await app.request(
        acceptInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: "{}",
        },
        env,
      );

      expect(response.status).toBe(409);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: ONBOARDING_ERROR_CODES.invitationNotPending },
      });
      expect(JSON.stringify(body)).not.toContain("invitation is not pending");
    });

    it("fails closed on path-org mismatch without leaking other-org invitation state", async () => {
      const env = makeEnv();
      runtime.acceptInvitation.mockResolvedValue(
        rpcFailure(ONBOARDING_ERROR_CODES.invitationNotPending, "invitation is not pending"),
      );

      const response = await app.request(
        crossTenantAcceptPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: "{}",
        },
        env,
      );

      expect(response.status).toBe(409);
      expect(runtime.acceptInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: otherOrgId,
          invitationId: invitationIdValue,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: ONBOARDING_ERROR_CODES.invitationNotPending },
      });
    });
  });

  describe("POST /v1/orgs/:organizationId/organizations", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(
        createOrganizationPath,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
        env,
      );

      expect(response.status).toBe(401);
      expect(runtime.createOperatorOrganization).not.toHaveBeenCalled();
    });

    it("rejects invalid operator organization resourceIds shapes", async () => {
      const env = makeEnv();
      const response = await app.request(
        createOrganizationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({
            resourceIds: "not-an-object",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.createOperatorOrganization).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: "validation.invalid_opaque_resource_id" },
      });
    });

    it("forwards operator organization creation to the Runtime Worker", async () => {
      const env = makeEnv();
      const response = await app.request(
        createOrganizationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({ organizationDisplayName: "Operator Org" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.createOperatorOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: INSTANCE_ID,
          organizationDisplayName: "Operator Org",
        }),
      );
      const forwarded = runtime.createOperatorOrganization.mock.calls[0]?.[0];
      expect(forwarded?.actorToken.length).toBeGreaterThan(0);
      expect(forwarded).not.toHaveProperty("operatorUserId");
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { organizationId: operatorOrgId, defaultTeamId: operatorTeamId },
      });
    });

    it("uses the worker-kit local development instance fallback when INSTANCE_ID is omitted", async () => {
      const env = makeEnvWithoutInstanceId();
      const response = await app.request(
        createOrganizationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({ organizationDisplayName: "Operator Org" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.createOperatorOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: "inst_LOCAL_DEV",
        }),
      );
    });

    it("maps not-instance-operator denial to stable envelopes", async () => {
      const env = makeEnv();
      runtime.createOperatorOrganization.mockResolvedValue(
        rpcFailure(
          ONBOARDING_ERROR_CODES.notInstanceOperator,
          "instance operator authority required",
        ),
      );

      const response = await app.request(
        createOrganizationPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: "{}",
        },
        env,
      );

      expect(response.status).toBe(403);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: ONBOARDING_ERROR_CODES.notInstanceOperator },
      });
      expect(JSON.stringify(body)).not.toContain("instance operator authority required");
    });
  });
});
