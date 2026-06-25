import { mintEphemeralSessionCredential, testSessionSigningSecret } from "@insecur/auth";
import {
  AUTH_ERROR_CODES,
  invitationId,
  membershipId,
  ONBOARDING_ERROR_CODES,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";

const {
  acceptInvitation,
  createInvitation,
  createOperatorOrganization,
  resolveEffectiveAccess,
  recordAccessDenial,
} = vi.hoisted(() => ({
  acceptInvitation: vi.fn(),
  createInvitation: vi.fn(),
  createOperatorOrganization: vi.fn(),
  resolveEffectiveAccess: vi.fn(),
  recordAccessDenial: vi.fn(),
}));

vi.mock("@insecur/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/onboarding")>();
  return {
    ...actual,
    acceptInvitation,
    createInvitation,
    createOperatorOrganization,
  };
});

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    resolveEffectiveAccess,
    recordAccessDenial,
  };
});

import app from "../../index.js";

const admittedUserId = userId.brand(ADMITTED_USER_ID_RAW);
const workosUserId = WORKOS_USER_ID;
const inviteeUserId = userId.brand("usr_00000000000000000000000071");

const orgId = organizationId.brand("org_00000000000000000000000001");
const otherOrgId = organizationId.brand("org_00000000000000000000000002");
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const invitationIdValue = invitationId.brand("inv_00000000000000000000000071");
const grantedMembershipId = membershipId.brand("mem_00000000000000000000000071");
const operatorOrgId = organizationId.brand("org_00000000000000000000000099");
const operatorTeamId = "team_00000000000000000000000099";

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  INSTANCE_ID: "inst_LOCAL_DEV",
  RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
  RUNTIME: { writeSecret: vi.fn(), consumeGrant: vi.fn() },
};

const createInvitationPath = `/v1/orgs/${orgId}/invitations`;
const acceptInvitationPath = `/v1/orgs/${orgId}/invitations/${invitationIdValue}/accept`;
const crossTenantCreatePath = `/v1/orgs/${otherOrgId}/invitations`;
const crossTenantAcceptPath = `/v1/orgs/${otherOrgId}/invitations/${invitationIdValue}/accept`;
const createOrganizationPath = `/v1/orgs/${orgId}/organizations`;

const invitationCreated = {
  invitationId: invitationIdValue,
  organizationId: orgId,
  teamId: "team_00000000000000000000000001",
  inviteeUserId,
  rolePreset: "developer",
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

async function authHeaders(): Promise<Record<string, string>> {
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
    vi.clearAllMocks();
    resolveEffectiveAccess.mockResolvedValue({
      organizationId: orgId,
      scopes: ["membership:manage"],
    });
    recordAccessDenial.mockResolvedValue({ auditEventId: "aud_test" });
    createInvitation.mockResolvedValue(invitationCreated);
    acceptInvitation.mockResolvedValue(invitationAccepted);
    createOperatorOrganization.mockResolvedValue(operatorOrganizationCreated);
  });

  describe("POST /v1/orgs/:organizationId/invitations", () => {
    it("returns auth.required when unauthenticated", async () => {
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
      expect(createInvitation).not.toHaveBeenCalled();
    });

    it("delegates invitation creation to the onboarding package", async () => {
      const response = await app.request(
        createInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            inviteeUserId,
            rolePreset: "developer",
            projectId: projectIdValue,
          }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { type: "user", userId: admittedUserId },
          organizationId: orgId,
          inviteeUserId,
          rolePreset: "developer",
          projectId: projectIdValue,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { invitationId: invitationIdValue, organizationId: orgId },
      });
      expect(JSON.stringify(body)).not.toMatch(/token|secret|password/i);
    });

    it("maps onboarding membership-management errors to stable envelopes", async () => {
      const { MembershipManagementError } = await import("@insecur/onboarding");
      createInvitation.mockRejectedValue(
        new MembershipManagementError(
          AUTH_ERROR_CODES.insufficientScope,
          "membership management scope required",
          orgId,
        ),
      );

      const response = await app.request(
        createInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(),
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

    it("tenant-qualifies cross-tenant invitation creation through the package seam", async () => {
      const { MembershipManagementError } = await import("@insecur/onboarding");
      createInvitation.mockRejectedValue(
        new MembershipManagementError(
          AUTH_ERROR_CODES.insufficientScope,
          "membership management scope required",
          otherOrgId,
        ),
      );

      const response = await app.request(
        crossTenantCreatePath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            inviteeUserId,
            rolePreset: "developer",
          }),
        },
        env,
      );

      expect(response.status).toBe(403);
      expect(createInvitation).toHaveBeenCalledWith(
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
      const response = await app.request(
        acceptInvitationPath,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
        env,
      );

      expect(response.status).toBe(401);
      expect(acceptInvitation).not.toHaveBeenCalled();
    });

    it("binds the authenticated actor and delegates acceptance to the onboarding package", async () => {
      const response = await app.request(
        acceptInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ membershipId: grantedMembershipId }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(acceptInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          invitationId: invitationIdValue,
          organizationId: orgId,
          acceptingUserId: admittedUserId,
          membershipId: grantedMembershipId,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { membershipId: grantedMembershipId, organizationId: orgId },
      });
    });

    it("maps invitation replay to onboarding.invitation_not_pending without leaking details", async () => {
      const { MembershipManagementError } = await import("@insecur/onboarding");
      acceptInvitation.mockRejectedValue(
        new MembershipManagementError(
          ONBOARDING_ERROR_CODES.invitationNotPending,
          "invitation is not pending",
          orgId,
          invitationIdValue,
        ),
      );

      const response = await app.request(
        acceptInvitationPath,
        {
          method: "POST",
          headers: await authHeaders(),
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
      const { MembershipManagementError } = await import("@insecur/onboarding");
      acceptInvitation.mockRejectedValue(
        new MembershipManagementError(
          ONBOARDING_ERROR_CODES.invitationNotPending,
          "invitation is not pending",
          otherOrgId,
          invitationIdValue,
        ),
      );

      const response = await app.request(
        crossTenantAcceptPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: "{}",
        },
        env,
      );

      expect(response.status).toBe(409);
      expect(acceptInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: otherOrgId,
          invitationId: invitationIdValue,
          acceptingUserId: admittedUserId,
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
      const response = await app.request(
        createOrganizationPath,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
        env,
      );

      expect(response.status).toBe(401);
      expect(createOperatorOrganization).not.toHaveBeenCalled();
    });

    it("delegates operator organization creation to the onboarding package", async () => {
      const response = await app.request(
        createOrganizationPath,
        {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ organizationDisplayName: "Operator Org" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(createOperatorOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          instanceId: env.INSTANCE_ID,
          operatorUserId: admittedUserId,
          organizationDisplayName: "Operator Org",
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: { organizationId: operatorOrgId, defaultTeamId: operatorTeamId },
      });
    });

    it("maps not-instance-operator denial to stable envelopes", async () => {
      const { MembershipManagementError } = await import("@insecur/onboarding");
      createOperatorOrganization.mockRejectedValue(
        new MembershipManagementError(
          ONBOARDING_ERROR_CODES.notInstanceOperator,
          "instance operator authority required",
        ),
      );

      const response = await app.request(
        createOrganizationPath,
        {
          method: "POST",
          headers: await authHeaders(),
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
