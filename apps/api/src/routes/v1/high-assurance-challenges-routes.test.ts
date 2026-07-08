import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret, type FakeWorkOSSessionEntry } from "@insecur/auth/testing";
import { CREDENTIAL_SCOPES } from "@insecur/access";
import { mintMachineAccessToken } from "@insecur/machine-auth";
import {
  AUTH_ERROR_CODES,
  HIGH_ASSURANCE_ERROR_CODES,
  OPERATION_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  machineIdentityId,
  operationId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import type { KnownErrorCode } from "@insecur/domain";
import type { RuntimeRpcResult } from "@insecur/worker-kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRuntimeRpcStub,
  type RuntimeRpcStub,
} from "../../../test/support/runtime-rpc-stub.js";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";

import app from "../../index.js";

vi.mock("@insecur/worker-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/worker-kit")>();
  const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
  return {
    ...actual,
    createAuthContext: (
      env: Parameters<typeof actual.createAuthContext>[0],
      options?: Parameters<typeof actual.createAuthContext>[1],
    ) => {
      const fakeSessions = (
        env as { readonly WORKOS_TEST_FAKE_SESSIONS?: readonly FakeWorkOSSessionEntry[] }
      ).WORKOS_TEST_FAKE_SESSIONS;
      return actual.createAuthContext(env, {
        ...options,
        ...(fakeSessions === undefined
          ? {}
          : { workos: createFakeWorkOSSessionPort(fakeSessions) }),
      });
    },
  };
});

const admittedUserId = userId.brand(ADMITTED_USER_ID_RAW);
const workosUserId = WORKOS_USER_ID;
const sessionId = "session_high_assurance_test";
const stepUpCode = "code_step_up_totp";
const stepUpCodeVerifier = "verifier_step_up_totp";

function workosFakeSessions(): readonly FakeWorkOSSessionEntry[] {
  return [
    {
      sessionData: "sealed_hac_clear",
      userId: workosUserId,
      sessionId,
      authorizationCode: stepUpCode,
      codeVerifier: stepUpCodeVerifier,
      authenticationMethod: "Password",
      authFactors: [{ type: "totp" }],
    },
  ];
}

function clearRequestBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    projectId: projectIdValue,
    stepUpCode,
    stepUpCodeVerifier,
    ...overrides,
  });
}

const orgId = organizationId.brand("org_00000000000000000000000001");
const otherOrgId = organizationId.brand("org_00000000000000000000000002");
const operationIdValue = operationId.brand("op_00000000000000000000000001");
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const machineId = machineIdentityId.brand("mach_00000000000000000000000002");
const machineAccessSigningSecret = "machine-access-signing-secret-00000000";

let runtime: RuntimeRpcStub;

function makeEnv() {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    INSTANCE_ID: "inst_LOCAL_DEV",
    RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
    MACHINE_ACCESS_SIGNING_SECRET: machineAccessSigningSecret,
    RUNTIME: runtime,
    WORKOS_TEST_FAKE_SESSIONS: workosFakeSessions(),
  };
}

const listPath = `/v1/orgs/${orgId}/high-assurance-challenges`;
const detailPath = `/v1/orgs/${orgId}/high-assurance-challenges/${operationIdValue}`;
const clearPath = `${detailPath}/clear`;
const denyPath = `${detailPath}/deny`;

const metadataOnlyChallenge = {
  operationId: operationIdValue,
  intentCode: "sync.run",
  challengeId: "challenge-001",
  projectId: projectIdValue,
  riskReasonCode: "high_assurance.risk.agent_step_up",
  requestedAt: "2026-06-24T00:00:00.000Z",
  expiresAt: "2026-06-24T01:00:00.000Z",
  requestingMachineIdentityId: machineIdentityId.brand("mach_00000000000000000000000001"),
  status: "pending" as const,
  hasClearedEvidence: false,
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
      sessionId,
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

async function machineAuthHeaders(
  env: ReturnType<typeof makeEnv>,
): Promise<Record<string, string>> {
  const minted = await mintMachineAccessToken({
    machineIdentityId: machineId,
    organizationId: orgId,
    projectId: projectIdValue,
    credentialScopes: [CREDENTIAL_SCOPES.runtimeInjectionRun],
    signingSecret: env.MACHINE_ACCESS_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.accessToken}`,
  };
}

describe("high-assurance challenge worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.listPendingHighAssuranceChallenges.mockResolvedValue({
      ok: true,
      value: { challenges: [metadataOnlyChallenge] },
    });
    runtime.getHighAssuranceChallenge.mockResolvedValue({
      ok: true,
      value: { challenge: metadataOnlyChallenge },
    });
    runtime.clearHighAssuranceChallenge.mockResolvedValue({
      ok: true,
      value: {
        operationId: operationIdValue,
        challengeId: metadataOnlyChallenge.challengeId,
        clearedAt: "2026-06-24T00:05:00.000Z",
        clearingUserId: admittedUserId,
      },
    });
    runtime.denyHighAssuranceChallenge.mockResolvedValue({
      ok: true,
      value: {
        operationId: operationIdValue,
        challengeId: metadataOnlyChallenge.challengeId,
        state: "canceled",
      },
    });
  });

  describe("GET /v1/orgs/:organizationId/high-assurance-challenges", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(listPath, { method: "GET" }, env);

      expect(response.status).toBe(401);
      expect(runtime.listPendingHighAssuranceChallenges).not.toHaveBeenCalled();
    });

    it("forwards the list read to the Runtime Worker and returns metadata-only rows", async () => {
      const env = makeEnv();
      const response = await app.request(
        listPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.listPendingHighAssuranceChallenges).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: orgId }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          challenges: [metadataOnlyChallenge],
        },
      });
      expect(JSON.stringify(body)).not.toMatch(/valueUtf8|plaintext|secret|password/i);
    });

    it("maps insufficient scope to auth.insufficient_scope", async () => {
      const env = makeEnv();
      runtime.listPendingHighAssuranceChallenges.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "actor lacks organization:read"),
      );

      const response = await app.request(
        listPath,
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

    it("returns an empty inbox when the caller lacks approval scope on visible projects", async () => {
      const env = makeEnv();
      runtime.listPendingHighAssuranceChallenges.mockResolvedValue({
        ok: true,
        value: { challenges: [] },
      });

      const response = await app.request(
        listPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { challenges: [] } });
    });
  });

  describe("GET /v1/orgs/:organizationId/high-assurance-challenges/:operationId", () => {
    it("returns metadata-only challenge evidence for an authorized user", async () => {
      const env = makeEnv();
      const response = await app.request(
        detailPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.getHighAssuranceChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          operationId: operationIdValue,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: true, data: { challenge: metadataOnlyChallenge } });
    });

    it("maps unknown operation IDs to operation.not_found without existence leakage", async () => {
      const env = makeEnv();
      runtime.getHighAssuranceChallenge.mockResolvedValue(
        rpcFailure(OPERATION_ERROR_CODES.notFound, "operation not found"),
      );

      const response = await app.request(
        detailPath,
        { method: "GET", headers: await authHeaders(env) },
        env,
      );

      expect(response.status).toBe(404);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: OPERATION_ERROR_CODES.notFound },
      });
      expect(JSON.stringify(body)).not.toContain("operation not found");
    });
  });

  describe("POST /v1/orgs/:organizationId/high-assurance-challenges/:operationId/clear", () => {
    it("forwards server-verified step-up evidence to the Runtime clear RPC", async () => {
      const env = makeEnv();
      const response = await app.request(
        clearPath,
        {
          method: "POST",
          headers: {
            ...(await authHeaders(env)),
            "Content-Type": "application/json",
          },
          body: clearRequestBody(),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.clearHighAssuranceChallenge).toHaveBeenCalledTimes(1);
      const clearCall = runtime.clearHighAssuranceChallenge.mock.calls[0]?.[0];
      expect(clearCall).toMatchObject({
        organizationId: orgId,
        operationId: operationIdValue,
        projectId: projectIdValue,
      });
      expect(clearCall?.sessionAssurance).toMatchObject({
        freshStepUpFactor: "totp",
        authenticationMethod: "Password",
      });
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          operationId: operationIdValue,
          challengeId: metadataOnlyChallenge.challengeId,
          clearingUserId: admittedUserId,
        },
      });
    });

    it("rejects clear without server-verified step-up PKCE fields", async () => {
      const env = makeEnv();

      const response = await app.request(
        clearPath,
        {
          method: "POST",
          headers: {
            ...(await authHeaders(env)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: projectIdValue,
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.clearHighAssuranceChallenge).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId },
      });
    });

    it("maps missing auth configuration to 503 via the global handler", async () => {
      const env = {
        ...makeEnv(),
        WORKOS_CLIENT_ID: "",
      };

      const response = await app.request(
        clearPath,
        {
          method: "POST",
          headers: {
            ...(await authHeaders(env)),
            "Content-Type": "application/json",
          },
          body: clearRequestBody(),
        },
        env,
      );

      expect(response.status).toBe(503);
      expect(runtime.clearHighAssuranceChallenge).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.configInvalid },
      });
    });

    it("rethrows WorkOS server failures as 500 without mapping them to validation errors", async () => {
      const baseSession = workosFakeSessions()[0];
      if (baseSession === undefined) {
        throw new Error("expected fake WorkOS session fixture");
      }
      const env = {
        ...makeEnv(),
        WORKOS_TEST_FAKE_SESSIONS: [
          {
            ...baseSession,
            authorizationCodeThrow: new Error("WorkOS upstream unavailable"),
          },
        ],
      };

      const response = await app.request(
        clearPath,
        {
          method: "POST",
          headers: {
            ...(await authHeaders(env)),
            "Content-Type": "application/json",
          },
          body: clearRequestBody(),
        },
        env,
      );

      expect(response.status).toBe(500);
      expect(await response.text()).toBe("Internal Server Error");
      expect(runtime.clearHighAssuranceChallenge).not.toHaveBeenCalled();
    });

    it("rejects client-supplied step-up factor without WorkOS exchange", async () => {
      const env = makeEnv();

      const response = await app.request(
        clearPath,
        {
          method: "POST",
          headers: {
            ...(await authHeaders(env)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: projectIdValue,
            freshStepUpFactor: "totp",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
      expect(runtime.clearHighAssuranceChallenge).not.toHaveBeenCalled();
    });

    it("rejects step-up without an eligible enrolled factor before Runtime clear", async () => {
      const baseSession = workosFakeSessions()[0];
      if (baseSession === undefined) {
        throw new Error("expected fake WorkOS session fixture");
      }
      const env = {
        ...makeEnv(),
        WORKOS_TEST_FAKE_SESSIONS: [
          {
            ...baseSession,
            authorizationCode: "code_no_mfa",
            codeVerifier: "verifier_no_mfa",
            authFactors: [],
          },
        ],
      };

      const response = await app.request(
        clearPath,
        {
          method: "POST",
          headers: {
            ...(await authHeaders(env)),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            projectId: projectIdValue,
            stepUpCode: "code_no_mfa",
            stepUpCodeVerifier: "verifier_no_mfa",
          }),
        },
        env,
      );

      expect(response.status).toBe(401);
      expect(runtime.clearHighAssuranceChallenge).not.toHaveBeenCalled();
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.mfaEnrollmentRequired },
      });
    });

    it("maps actor mismatch to high_assurance.actor_mismatch", async () => {
      const env = makeEnv();
      runtime.clearHighAssuranceChallenge.mockResolvedValue(
        rpcFailure(HIGH_ASSURANCE_ERROR_CODES.actorMismatch, "actor mismatch"),
      );

      const response = await app.request(
        clearPath,
        {
          method: "POST",
          headers: {
            ...(await authHeaders(env)),
            "Content-Type": "application/json",
          },
          body: clearRequestBody(),
        },
        env,
      );

      expect(response.status).toBe(403);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: HIGH_ASSURANCE_ERROR_CODES.actorMismatch },
      });
    });
  });

  describe("POST /v1/orgs/:organizationId/high-assurance-challenges/:operationId/deny", () => {
    it("forwards deny to the Runtime RPC and returns canceled metadata", async () => {
      const env = makeEnv();
      const response = await app.request(
        denyPath,
        {
          method: "POST",
          headers: await authHeaders(env),
        },
        env,
      );

      expect(response.status).toBe(200);
      expect(runtime.denyHighAssuranceChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: orgId,
          operationId: operationIdValue,
        }),
      );
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          operationId: operationIdValue,
          challengeId: metadataOnlyChallenge.challengeId,
          state: "canceled",
        },
      });
    });

    it("tenant-qualifies cross-tenant denies through the Runtime seam", async () => {
      const env = makeEnv();
      runtime.denyHighAssuranceChallenge.mockResolvedValue(
        rpcFailure(OPERATION_ERROR_CODES.notFound, "operation not found"),
      );

      const response = await app.request(
        `/v1/orgs/${otherOrgId}/high-assurance-challenges/${operationIdValue}/deny`,
        {
          method: "POST",
          headers: await authHeaders(env),
        },
        env,
      );

      expect(response.status).toBe(404);
      expect(runtime.denyHighAssuranceChallenge).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: otherOrgId }),
      );
    });
  });

  describe("machine actor rejection", () => {
    it("rejects machine session credentials on list without reaching Runtime RPC", async () => {
      const env = makeEnv();
      const response = await app.request(
        listPath,
        { method: "GET", headers: await machineAuthHeaders(env) },
        env,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.invalid },
      });
      expect(runtime.listPendingHighAssuranceChallenges).not.toHaveBeenCalled();
    });

    it("rejects machine session credentials on clear without reaching Runtime RPC", async () => {
      const env = makeEnv();
      const response = await app.request(
        clearPath,
        {
          method: "POST",
          headers: {
            ...(await machineAuthHeaders(env)),
            "Content-Type": "application/json",
          },
          body: clearRequestBody(),
        },
        env,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.invalid },
      });
      expect(runtime.clearHighAssuranceChallenge).not.toHaveBeenCalled();
    });

    it("rejects machine session credentials on deny without reaching Runtime RPC", async () => {
      const env = makeEnv();
      const response = await app.request(
        denyPath,
        {
          method: "POST",
          headers: await machineAuthHeaders(env),
        },
        env,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.invalid },
      });
      expect(runtime.denyHighAssuranceChallenge).not.toHaveBeenCalled();
    });
  });
});
