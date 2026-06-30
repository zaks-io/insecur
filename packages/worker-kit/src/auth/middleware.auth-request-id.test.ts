import { userId } from "@insecur/domain";
import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { requireUserActor } from "./middleware.js";
import {
  createFakeAdmissionRuntime,
  type FakeAdmissionRuntime,
} from "./testing/fake-admission-runtime.js";

const instanceId = "inst_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const workosUserId = "user_not_admitted";
const deniedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5F");

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

async function deniedBearerHeaders(): Promise<Record<string, string>> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: deniedUserId,
      workosUserId,
      sessionId: "session_not_admitted",
    },
    signingSecret: testSessionSigningSecret(),
  });
  return { Authorization: `Bearer ${minted.credential}` };
}

function createAuthFailureApp(): Hono<{ Bindings: AuthWorkerEnv }> {
  const app = new Hono<{ Bindings: AuthWorkerEnv }>();
  app.onError((err, context) => {
    if ("requestId" in err && typeof err.requestId === "string") {
      return context.json(
        {
          ok: false,
          error: { code: "auth.required", message: err.message, retryable: false },
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

describe("requireUserActor admission-denied request id", () => {
  beforeEach(() => {
    // An empty admissions map resolves every subject to not-admitted.
    runtime = createFakeAdmissionRuntime();
  });

  it("reuses one request id for the denied-admission forward and the auth failure response", async () => {
    const app = createAuthFailureApp();
    const response = await app.request(
      "/protected",
      { method: "GET", headers: await deniedBearerHeaders() },
      envWith(runtime),
    );

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.required", retryable: false },
    });

    const responseRequestId = (body as { meta?: { requestId?: string } }).meta?.requestId;
    expect(responseRequestId).toMatch(/^req_/);
    expect(runtime.deniedCalls).toHaveLength(1);
    expect(runtime.deniedCalls[0]?.requestId).toBe(responseRequestId);
  });

  it("preserves auth failure response when the denied-admission forward fails", async () => {
    const failingRuntime: FakeAdmissionRuntime = {
      deniedCalls: [],
      resolveAdmission: () => Promise.resolve({ ok: true, value: { userId: null } }),
      recordAdmissionDenied: () => Promise.reject(new Error("binding down")),
    };

    const app = createAuthFailureApp();
    const response = await app.request(
      "/protected",
      { method: "GET", headers: await deniedBearerHeaders() },
      envWith(failingRuntime),
    );

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect((body as { meta?: { requestId?: string } }).meta?.requestId).toMatch(/^req_/);
  });
});
