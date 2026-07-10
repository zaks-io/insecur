import {
  generateCsrfToken,
  INSECUR_CSRF_COOKIE,
  mintEphemeralSessionCredential,
  WORKOS_SESSION_COOKIE,
} from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  BOOTSTRAP_ERROR_CODES,
  membershipId,
  organizationId,
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
const orgId = organizationId.brand("org_00000000000000000000000001");
const operatorGrantId = "iop_00000000000000000000000001";
const ownerMembershipIdValue = membershipId.brand("mem_00000000000000000000000001");

const statusPath = "/v1/instance/bootstrap/status";
const claimPath = "/v1/instance/bootstrap/operator-claim";

const INSTANCE_ID = "inst_BOOTSTRAP_TEST";

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

function makeEnv() {
  return { ...makeEnvWithoutInstanceId(), INSTANCE_ID };
}

const awaitingClaimStatus = {
  phase: "awaiting_operator_claim" as const,
  instanceId: INSTANCE_ID,
  organizationId: orgId,
};

const completeStatus = {
  phase: "complete" as const,
  instanceId: INSTANCE_ID,
  organizationId: orgId,
  operatorUserId: admittedUserId,
};

const claimSuccess = {
  instanceId: INSTANCE_ID,
  organizationId: orgId,
  operatorGrantId,
  ownerMembershipId: ownerMembershipIdValue,
  status: completeStatus,
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
      sessionId: "session_bootstrap_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
    "Content-Type": "application/json",
  };
}

function claimBody(bootstrapSecret: string): string {
  return JSON.stringify({
    bootstrapSecret,
    operatorGrantId,
    ownerMembershipId: ownerMembershipIdValue,
  });
}

describe("instance bootstrap worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.getBootstrapStatus.mockResolvedValue({ ok: true, value: awaitingClaimStatus });
    runtime.completeBootstrapOperatorClaim.mockResolvedValue({ ok: true, value: claimSuccess });
  });

  describe("GET /v1/instance/bootstrap/status", () => {
    it("forwards the unauthenticated status read to the Runtime Worker", async () => {
      const env = makeEnv();
      const response = await app.request(statusPath, { method: "GET" }, env);

      expect(response.status).toBe(200);
      expect(runtime.getBootstrapStatus).toHaveBeenCalledWith({ instanceId: INSTANCE_ID });
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          phase: "awaiting_operator_claim",
          instanceId: INSTANCE_ID,
          organizationId: orgId,
        },
      });
    });

    it("uses the worker-kit local development instance fallback when INSTANCE_ID is omitted", async () => {
      const env = makeEnvWithoutInstanceId();
      runtime.getBootstrapStatus.mockResolvedValue({
        ok: true,
        value: { ...awaitingClaimStatus, instanceId: "inst_LOCAL_DEV" },
      });

      const response = await app.request(statusPath, { method: "GET" }, env);

      expect(response.status).toBe(200);
      expect(runtime.getBootstrapStatus).toHaveBeenCalledWith({ instanceId: "inst_LOCAL_DEV" });
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          phase: "awaiting_operator_claim",
          instanceId: "inst_LOCAL_DEV",
        },
      });
    });
  });

  describe("POST /v1/instance/bootstrap/operator-claim", () => {
    it("returns auth.required when unauthenticated", async () => {
      const env = makeEnv();
      const response = await app.request(
        claimPath,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: claimBody("bootstrap-secret-material"),
        },
        env,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: AUTH_ERROR_CODES.required } });
      expect(runtime.completeBootstrapOperatorClaim).not.toHaveBeenCalled();
    });

    it("rejects browser-session auth even with CSRF on mutation routes", async () => {
      const env = makeEnv();
      const csrf = generateCsrfToken();
      const response = await app.request(
        claimPath,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: `${WORKOS_SESSION_COOKIE}=sealed_bootstrap_cookie_auth_test; ${INSECUR_CSRF_COOKIE}=${csrf}`,
            "x-insecur-csrf": csrf,
          },
          body: claimBody("bootstrap-secret-material"),
        },
        env,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ ok: false, error: { code: AUTH_ERROR_CODES.required } });
      expect(runtime.completeBootstrapOperatorClaim).not.toHaveBeenCalled();
    });

    it("forwards the operator claim to the Runtime Worker with a hop token", async () => {
      const env = makeEnv();
      const bootstrapSecret = "bootstrap-secret-material";
      const response = await app.request(
        claimPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: claimBody(bootstrapSecret),
        },
        env,
      );

      expect(response.status).toBe(200);
      const claimCall = runtime.completeBootstrapOperatorClaim.mock.calls[0]?.[0];
      expect(claimCall).toMatchObject({
        instanceId: INSTANCE_ID,
        bootstrapSecret,
        operatorGrantId,
        ownerMembershipId: ownerMembershipIdValue,
      });
      expect(claimCall?.actorToken.length).toBeGreaterThan(0);
      expect(claimCall).not.toHaveProperty("actor");
      expect(claimCall?.requestId).toEqual(expect.stringMatching(/^req_/));
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: true,
        data: {
          instanceId: INSTANCE_ID,
          organizationId: orgId,
          operatorGrantId,
          ownerMembershipId: ownerMembershipIdValue,
          status: {
            phase: "complete",
            operatorUserId: admittedUserId,
          },
        },
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain(bootstrapSecret);
    });

    it("denies duplicate claim attempts with bootstrap.already_claimed", async () => {
      const env = makeEnv();
      runtime.completeBootstrapOperatorClaim.mockResolvedValue(
        rpcFailure(
          BOOTSTRAP_ERROR_CODES.alreadyClaimed,
          "bootstrap operator claim is already consumed",
        ),
      );

      const response = await app.request(
        claimPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: claimBody("bootstrap-secret-material"),
        },
        env,
      );

      expect(response.status).toBe(409);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: BOOTSTRAP_ERROR_CODES.alreadyClaimed },
      });
    });

    it("denies claim completion with bootstrap.invalid_secret", async () => {
      const env = makeEnv();
      runtime.completeBootstrapOperatorClaim.mockResolvedValue(
        rpcFailure(BOOTSTRAP_ERROR_CODES.invalidSecret, "bootstrap secret verification failed"),
      );

      const response = await app.request(
        claimPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: claimBody("wrong-bootstrap-secret"),
        },
        env,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: BOOTSTRAP_ERROR_CODES.invalidSecret },
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain("wrong-bootstrap-secret");
    });
  });
});
