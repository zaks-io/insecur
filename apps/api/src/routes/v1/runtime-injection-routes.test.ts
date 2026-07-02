import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  VALIDATION_ERROR_CODES,
  injectionGrantId,
  organizationId,
  userId,
  type KnownErrorCode,
} from "@insecur/domain";
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
const grantIdValue = injectionGrantId.brand("igr_00000000000000000000000001");

const runCompletedPath = `/v1/orgs/${orgId}/runtime-injection/grants/${grantIdValue}/run-completed`;

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

async function authHeaders(env: ReturnType<typeof makeEnv>): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_run_completed_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
    "Content-Type": "application/json",
  };
}

describe("runtime injection run-completed route", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.recordInjectionRunCompleted.mockResolvedValue({
      ok: true,
      value: {
        auditEventId: "aud_00000000000000000000000001",
        alreadyRecorded: false,
      },
    });
  });

  it("returns auth.required when unauthenticated", async () => {
    const env = makeEnv();
    const response = await app.request(
      runCompletedPath,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childExitCode: 0 }),
      },
      env,
    );

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: AUTH_ERROR_CODES.required } });
    expect(runtime.recordInjectionRunCompleted).not.toHaveBeenCalled();
  });

  it("forwards run completion metadata to the Runtime Worker", async () => {
    const env = makeEnv();
    const response = await app.request(
      runCompletedPath,
      {
        method: "POST",
        headers: await authHeaders(env),
        body: JSON.stringify({ childExitCode: 0 }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(runtime.recordInjectionRunCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        grantId: grantIdValue,
        childExitCode: 0,
      }),
    );
    const forwarded = runtime.recordInjectionRunCompleted.mock.calls[0]?.[0];
    expect(forwarded?.actorToken.length).toBeGreaterThan(0);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: {
        auditEventId: "aud_00000000000000000000000001",
        alreadyRecorded: false,
      },
    });
  });

  it("maps missing childExitCode to HTTP 400 at the API edge", async () => {
    const env = makeEnv();
    const response = await app.request(
      runCompletedPath,
      {
        method: "POST",
        headers: await authHeaders(env),
        body: JSON.stringify({}),
      },
      env,
    );

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: VALIDATION_ERROR_CODES.invalidCommandInput },
    });
    expect(runtime.recordInjectionRunCompleted).not.toHaveBeenCalled();
  });

  it("maps invalid childExitCode to HTTP 400 at the API edge", async () => {
    const env = makeEnv();
    const response = await app.request(
      runCompletedPath,
      {
        method: "POST",
        headers: await authHeaders(env),
        body: JSON.stringify({ childExitCode: -1 }),
      },
      env,
    );

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: VALIDATION_ERROR_CODES.invalidCommandInput },
    });
    expect(runtime.recordInjectionRunCompleted).not.toHaveBeenCalled();
  });

  it("maps runtime grant denial to HTTP 404", async () => {
    runtime.recordInjectionRunCompleted.mockResolvedValue(
      rpcFailure("injection.grant_denied", "injection grant denied"),
    );

    const env = makeEnv();
    const response = await app.request(
      runCompletedPath,
      {
        method: "POST",
        headers: await authHeaders(env),
        body: JSON.stringify({ childExitCode: 0 }),
      },
      env,
    );

    expect(response.status).toBe(404);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "injection.grant_denied" },
    });
  });

  it.each(["missing grant", "unconsumed grant", "consumed grant without consume scope"] as const)(
    "maps oracle-closed run completion denial (%s) to HTTP 403",
    async () => {
      runtime.recordInjectionRunCompleted.mockResolvedValue(
        rpcFailure(AUTH_ERROR_CODES.insufficientScope, "runtime injection scope required"),
      );

      const env = makeEnv();
      const response = await app.request(
        runCompletedPath,
        {
          method: "POST",
          headers: await authHeaders(env),
          body: JSON.stringify({ childExitCode: 0 }),
        },
        env,
      );

      expect(response.status).toBe(403);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: { code: AUTH_ERROR_CODES.insufficientScope },
      });
    },
  );
});
