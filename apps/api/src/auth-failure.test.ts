import {
  generateCsrfToken,
  INSECUR_SESSION_CREDENTIAL_HEADER,
  testSessionSigningSecret,
} from "@insecur/auth";
import { describe, expect, it } from "vitest";
import { WORKOS_USER_ID } from "../test/support/setup-unit-auth.js";
import app from "./index.js";

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  WORKOS_FAKE_SESSIONS_JSON: "[]",
};

function expectAuthFailureEnvelope(body: unknown): void {
  expect(body).toMatchObject({ ok: false });
  if (typeof body !== "object" || body === null) {
    expect.fail("expected object response body");
    return;
  }
  const envelope = body as {
    error?: { code?: unknown; message?: unknown; retryable?: unknown };
    meta?: { requestId?: unknown };
  };
  expect(typeof envelope.error?.code).toBe("string");
  expect(typeof envelope.error?.message).toBe("string");
  expect(typeof envelope.error?.retryable).toBe("boolean");
  expect(typeof envelope.meta?.requestId).toBe("string");
  expect(envelope.meta?.requestId).toMatch(/^req_/);
}

function cliExchangeSuccessEnv(sealedSession: string): typeof env {
  return {
    ...env,
    WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
      {
        sessionData: sealedSession,
        userId: WORKOS_USER_ID,
        sessionId: "session_success_test",
        authenticationMethod: "Passkey",
      },
    ]),
  };
}

function expectCliExchangeSuccessBody(body: unknown): void {
  expect(body).toMatchObject({
    ok: true,
    data: { sessionId: "session_success_test" },
  });
  if (typeof body !== "object" || body === null) {
    expect.fail("expected object response body");
    return;
  }
  const successBody = body as { meta?: { requestId?: unknown } };
  expect(typeof successBody.meta?.requestId).toBe("string");
  expect(successBody.meta?.requestId).toMatch(/^req_/);
}

describe("centralized AuthFailure HTTP mapping", () => {
  it("maps requireUserActor failures to 401 via app.onError", async () => {
    const response = await app.request("/v1/session/whoami", { method: "GET" }, env);
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expectAuthFailureEnvelope(body);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.required", retryable: false },
    });
  });

  it("maps /cli/exchange failures to 401 via app.onError", async () => {
    const csrf = generateCsrfToken();
    const response = await app.request(
      "/v1/auth/cli/exchange",
      {
        method: "POST",
        headers: {
          Cookie: `insecur_csrf=${csrf}`,
          "x-insecur-csrf": csrf,
        },
      },
      env,
    );
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expectAuthFailureEnvelope(body);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.required", retryable: false },
    });
  });

  it("does not leak AuthFailureError as a 500", async () => {
    const response = await app.request("/v1/session/whoami", { method: "GET" }, env);
    expect(response.status).not.toBe(500);
    const text = await response.text();
    expect(text).not.toContain("AuthFailureError");
    expect(text).not.toContain("Internal Server Error");
  });

  it("keeps /cli/exchange success path unchanged", async () => {
    const sealedSession = "sealed_auth_failure_success_test";
    const csrf = generateCsrfToken();
    const response = await app.request(
      "/v1/auth/cli/exchange",
      {
        method: "POST",
        headers: {
          Cookie: `wos-session=${sealedSession}; insecur_csrf=${csrf}`,
          "x-insecur-csrf": csrf,
        },
      },
      cliExchangeSuccessEnv(sealedSession),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get(INSECUR_SESSION_CREDENTIAL_HEADER)).toBeTruthy();
    expectCliExchangeSuccessBody(await response.json());
  });
});
