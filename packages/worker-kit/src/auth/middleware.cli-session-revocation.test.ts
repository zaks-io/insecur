import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthFailureError } from "./auth-failure-error.js";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { requireUserActor } from "./middleware.js";
import {
  createFakeAdmissionRuntime,
  fakeAdmittedUserId,
  type FakeAdmissionRuntime,
} from "./testing/fake-admission-runtime.js";

const instanceId = "inst_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const workosUserId = "user_admitted";
const sessionId = "session_revoked_cli";
const admittedUserId = fakeAdmittedUserId();

let runtime: FakeAdmissionRuntime;

function envWith(rt: FakeAdmissionRuntime): AuthWorkerEnv {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    INSTANCE_ID: instanceId,
    RUNTIME: rt,
  };
}

async function admittedBearerHeaders(): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId,
    },
    signingSecret: testSessionSigningSecret(),
  });
  return { Authorization: `Bearer ${minted.credential}` };
}

function createProtectedApp(): Hono<{ Bindings: AuthWorkerEnv }> {
  const app = new Hono<{ Bindings: AuthWorkerEnv }>();
  app.onError((err, context) => {
    if (err instanceof AuthFailureError) {
      return context.json(
        {
          ok: false,
          error: { code: err.failure.code, message: err.failure.message, retryable: false },
          meta: { requestId: err.requestId },
        },
        401,
      );
    }
    throw err;
  });
  app.get("/protected", requireUserActor, (context) => context.json({ ok: true }));
  return app;
}

describe("requireUserActor CLI session revocation", () => {
  beforeEach(() => {
    runtime = createFakeAdmissionRuntime({ [workosUserId]: admittedUserId });
  });

  it("folds revocation into resolveAdmission and issues only one pre-auth RPC", async () => {
    const app = createProtectedApp();
    const response = await app.request(
      "/protected",
      { method: "GET", headers: await admittedBearerHeaders() },
      envWith(runtime),
    );

    expect(response.status).toBe(200);
    expect(runtime.resolveAdmissionCalls).toHaveLength(1);
    expect(runtime.resolveAdmissionCalls[0]).toMatchObject({
      instanceId,
      workosUserId,
      sessionId,
    });
  });

  it("fails closed when resolveAdmission reports a revoked CLI session", async () => {
    runtime = createFakeAdmissionRuntime(
      { [workosUserId]: admittedUserId },
      { revokedSessionIds: new Set([sessionId]) },
    );
    const app = createProtectedApp();
    const response = await app.request(
      "/protected",
      { method: "GET", headers: await admittedBearerHeaders() },
      envWith(runtime),
    );

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.invalid" },
    });
    expect(runtime.resolveAdmissionCalls).toHaveLength(1);
  });
});
