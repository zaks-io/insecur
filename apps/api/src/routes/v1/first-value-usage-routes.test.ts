import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { AUTH_ERROR_CODES, organizationId, userId, type KnownErrorCode } from "@insecur/domain";
import type { FirstValueUsageStatusRpcPayload, RuntimeRpcResult } from "@insecur/worker-kit";
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

const usagePath = `/v1/orgs/${orgId}/first-value-usage`;

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

function rpcFailure(
  code: KnownErrorCode,
  message: string,
  retryable = false,
): RuntimeRpcResult<never> {
  return { ok: false, error: { code, message, retryable } };
}

const idleUsage: FirstValueUsageStatusRpcPayload = {
  secretWrites: 0,
  grantConsumed: 0,
  runCompleted: 0,
  firstInjectionObserved: false,
};

const injectedUsage: FirstValueUsageStatusRpcPayload = {
  secretWrites: 1,
  grantConsumed: 1,
  runCompleted: 0,
  firstInjectionObserved: true,
};

async function authHeaders(env: ReturnType<typeof makeEnv>): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_usage_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return { Authorization: `Bearer ${minted.credential}` };
}

describe("first-value usage routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.queryFirstValueUsage.mockResolvedValue({ ok: true, value: idleUsage });
  });

  it("returns auth.required when unauthenticated", async () => {
    const env = makeEnv();
    const response = await app.request(usagePath, { method: "GET" }, env);

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: AUTH_ERROR_CODES.required } });
    expect(runtime.queryFirstValueUsage).not.toHaveBeenCalled();
  });

  it("forwards the read to the Runtime Worker and returns metadata-only counters", async () => {
    const env = makeEnv();
    const response = await app.request(
      usagePath,
      { method: "GET", headers: await authHeaders(env) },
      env,
    );

    expect(response.status).toBe(200);
    expect(runtime.queryFirstValueUsage).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgId }),
    );
    const forwarded = runtime.queryFirstValueUsage.mock.calls[0]?.[0];
    expect(forwarded?.actorToken.length).toBeGreaterThan(0);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: true, data: idleUsage });
    expect(JSON.stringify(body)).not.toMatch(/hunter2|secret-value|plaintext/i);
  });

  it("flips firstInjectionObserved when grant consumption is recorded", async () => {
    runtime.queryFirstValueUsage.mockResolvedValue({ ok: true, value: injectedUsage });

    const env = makeEnv();
    const response = await app.request(
      usagePath,
      { method: "GET", headers: await authHeaders(env) },
      env,
    );

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { firstInjectionObserved: true, grantConsumed: 1 },
    });
  });

  it("maps insufficient scope to HTTP 403", async () => {
    runtime.queryFirstValueUsage.mockResolvedValue(
      rpcFailure(AUTH_ERROR_CODES.insufficientScope, "organization read required"),
    );

    const env = makeEnv();
    const response = await app.request(
      usagePath,
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
