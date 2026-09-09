import { VALIDATION_ERROR_CODES } from "@insecur/domain";
import { createInMemoryRateLimiter } from "@insecur/worker-kit";
import { describe, expect, it, vi } from "vitest";

import { createRuntimeRpcStub } from "../test/support/runtime-rpc-stub.js";
import app from "./index.js";
import { API_REQUEST_BODY_LIMIT_BYTES } from "./request-body-limit.js";

const AUTH_PATH = "/v1/auth/cli/pkce/exchange";

function testEnv(writeDataPoint = vi.fn<AnalyticsEngineDataset["writeDataPoint"]>()) {
  return {
    API_ANALYTICS: { writeDataPoint },
    AUTH_EXCHANGE_IP: createInMemoryRateLimiter(1),
    DEPLOY_SHA: "test-deploy-sha",
    INSTANCE_ID: "inst_BODY_LIMIT_TEST",
    RUNTIME: createRuntimeRpcStub(),
    RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
    SESSION_SIGNING_SECRET: "session-signing-secret-000000000000000000000000",
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  };
}

const requestHeaders = {
  "cf-connecting-ip": "203.0.113.90",
  "Content-Type": "application/json",
};

async function expectBodyLimitResponse(response: Response): Promise<void> {
  expect(response.status).toBe(413);
  const body = await response.json();
  expect(body).toMatchObject({
    ok: false,
    error: {
      code: VALIDATION_ERROR_CODES.requestBodyTooLarge,
      retryable: false,
    },
    meta: {},
  });
  expect(typeof (body as { meta: { requestId: unknown } }).meta.requestId).toBe("string");
}

async function expectRateLimitWasNotConsumed(env: ReturnType<typeof testEnv>): Promise<void> {
  const invalidBody = JSON.stringify({});
  const firstSmallResponse = await app.request(
    AUTH_PATH,
    { method: "POST", headers: requestHeaders, body: invalidBody },
    env,
  );
  expect(firstSmallResponse.status).toBe(400);

  const secondSmallResponse = await app.request(
    AUTH_PATH,
    { method: "POST", headers: requestHeaders, body: invalidBody },
    env,
  );
  expect(secondSmallResponse.status).toBe(429);
}

describe("API request body limit", () => {
  it("rejects a declared oversized body before analytics and abuse accounting", async () => {
    const writeDataPoint = vi.fn<AnalyticsEngineDataset["writeDataPoint"]>();
    const env = testEnv(writeDataPoint);
    const body = "x".repeat(API_REQUEST_BODY_LIMIT_BYTES + 1);

    const response = await app.request(
      AUTH_PATH,
      {
        method: "POST",
        headers: { ...requestHeaders, "Content-Length": String(body.length) },
        body,
      },
      env,
    );

    await expectBodyLimitResponse(response);
    expect(writeDataPoint).not.toHaveBeenCalled();
    await expectRateLimitWasNotConsumed(env);
  });

  it("stops an oversized streamed body without a Content-Length header", async () => {
    const writeDataPoint = vi.fn<AnalyticsEngineDataset["writeDataPoint"]>();
    const env = testEnv(writeDataPoint);
    const chunk = new TextEncoder().encode("x".repeat(API_REQUEST_BODY_LIMIT_BYTES / 2 + 1));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.close();
      },
    });

    const response = await app.request(
      AUTH_PATH,
      {
        method: "POST",
        headers: requestHeaders,
        body,
        duplex: "half",
      } as RequestInit & { duplex: "half" },
      env,
    );

    await expectBodyLimitResponse(response);
    expect(writeDataPoint).not.toHaveBeenCalled();
    await expectRateLimitWasNotConsumed(env);
  });
});
