import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret } from "@insecur/auth/testing";
import {
  AUTH_ERROR_CODES,
  organizationId,
  parseDisplayName,
  userId,
  webhookSubscriptionId,
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
const orgId = organizationId.brand("org_00000000000000000000000011");
const subscriptionId = webhookSubscriptionId.brand("whsub_00000000000000000000000011");

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

const basePath = `/v1/orgs/${orgId}/webhook-subscriptions`;

/** Low-entropy fixture only; never a real signing secret. */
const TEST_WEBHOOK_SIGNING_SECRET_SENTINEL = "webhook-signing-secret-test-sentinel";
const TEST_ROTATED_SIGNING_SECRET_SENTINEL = "hmac-secret-do-not-use";

function displayName(raw: string) {
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(parsed.code);
  }
  return parsed.value;
}

const subscriptionRead = {
  subscriptionId,
  organizationId: orgId,
  displayName: displayName("Security alerts"),
  status: "active" as const,
  eventCodes: ["secret.non_protected_write"],
  deliveryEmail: null,
  enableEmailChannel: false,
  enableInAppChannel: true,
  createdAt: "2026-07-07T12:00:00.000Z",
  updatedAt: "2026-07-07T12:00:00.000Z",
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
      sessionId: "session_webhook_subscriptions_test",
    },
    signingSecret: env.SESSION_SIGNING_SECRET,
  });
  return {
    Authorization: `Bearer ${minted.credential}`,
  };
}

describe("webhook subscription worker routes", () => {
  beforeEach(() => {
    runtime = createRuntimeRpcStub();
    runtime.listWebhookEventCodes.mockResolvedValue({
      ok: true,
      value: { eventCodes: ["secret.non_protected_write"] },
    });
    runtime.listWebhookSubscriptions.mockResolvedValue({
      ok: true,
      value: { subscriptions: [subscriptionRead] },
    });
    runtime.createWebhookSubscription.mockResolvedValue({
      ok: true,
      value: { ...subscriptionRead, signingSecret: TEST_WEBHOOK_SIGNING_SECRET_SENTINEL },
    });
    runtime.updateWebhookSubscription.mockResolvedValue({
      ok: true,
      value: subscriptionRead,
    });
    runtime.deleteWebhookSubscription.mockResolvedValue({
      ok: true,
      value: { ok: true },
    });
    runtime.rotateWebhookSigningSecret.mockResolvedValue({
      ok: true,
      value: { signingSecret: TEST_ROTATED_SIGNING_SECRET_SENTINEL },
    });
  });

  it("returns auth.required when unauthenticated", async () => {
    const env = makeEnv();
    const response = await app.request(basePath, { method: "GET" }, env);

    expect(response.status).toBe(401);
    expect(runtime.listWebhookSubscriptions).not.toHaveBeenCalled();
  });

  it("lists webhook subscriptions through the Runtime Worker", async () => {
    const env = makeEnv();
    const response = await app.request(
      basePath,
      { method: "GET", headers: await authHeaders(env) },
      env,
    );

    expect(response.status).toBe(200);
    expect(runtime.listWebhookSubscriptions).toHaveBeenCalledTimes(1);
    const forwarded = runtime.listWebhookSubscriptions.mock.calls[0]?.[0];
    expect(forwarded?.organizationId).toBe(orgId);
    expect(forwarded?.actorToken.length).toBeGreaterThan(0);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { subscriptions: [subscriptionRead] },
    });
    expect(JSON.stringify(body)).not.toMatch(/signingSecret|plaintext/i);
  });

  it("creates webhook subscriptions with metadata-only bodies", async () => {
    const env = makeEnv();
    const response = await app.request(
      basePath,
      {
        method: "POST",
        headers: {
          ...(await authHeaders(env)),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          displayName: "Security alerts",
          eventCodes: ["secret.non_protected_write"],
          enableInAppChannel: true,
        }),
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(runtime.createWebhookSubscription).toHaveBeenCalledTimes(1);
    const forwarded = runtime.createWebhookSubscription.mock.calls[0]?.[0];
    expect(forwarded?.organizationId).toBe(orgId);
    expect(forwarded?.eventCodes).toEqual(["secret.non_protected_write"]);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { signingSecret: TEST_WEBHOOK_SIGNING_SECRET_SENTINEL },
    });
  });

  it("lists selectable webhook event types", async () => {
    const env = makeEnv();
    const response = await app.request(
      `${basePath}/event-types`,
      { method: "GET", headers: await authHeaders(env) },
      env,
    );

    expect(response.status).toBe(200);
    expect(runtime.listWebhookEventCodes).toHaveBeenCalledTimes(1);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { eventCodes: ["secret.non_protected_write"] },
    });
  });

  it("updates, deletes, and rotates signing secrets by subscription id", async () => {
    const env = makeEnv();
    const headers = {
      ...(await authHeaders(env)),
      "content-type": "application/json",
    };

    const patchResponse = await app.request(
      `${basePath}/${subscriptionId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "disabled" }),
      },
      env,
    );
    expect(patchResponse.status).toBe(200);
    expect(runtime.updateWebhookSubscription.mock.calls[0]?.[0]?.subscriptionId).toBe(
      subscriptionId,
    );

    const deleteResponse = await app.request(
      `${basePath}/${subscriptionId}`,
      {
        method: "DELETE",
        headers: await authHeaders(env),
      },
      env,
    );
    expect(deleteResponse.status).toBe(200);
    expect(runtime.deleteWebhookSubscription).toHaveBeenCalledTimes(1);

    const rotateResponse = await app.request(
      `${basePath}/${subscriptionId}/rotate-signing-secret`,
      { method: "POST", headers: await authHeaders(env) },
      env,
    );
    expect(rotateResponse.status).toBe(200);
    expect(runtime.rotateWebhookSigningSecret).toHaveBeenCalledTimes(1);
  });

  it("maps insufficient scope denials from the Runtime Worker", async () => {
    const env = makeEnv();
    runtime.listWebhookSubscriptions.mockResolvedValue(
      rpcFailure(AUTH_ERROR_CODES.insufficientScope, "Missing required permission."),
    );

    const response = await app.request(
      basePath,
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
