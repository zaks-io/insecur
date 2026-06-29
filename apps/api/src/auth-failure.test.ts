import { INSECUR_SESSION_CREDENTIAL_HEADER, testSessionSigningSecret } from "@insecur/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntimeRpcStub } from "../test/support/runtime-rpc-stub.js";
import { WORKOS_USER_ID } from "../test/support/setup-unit-auth.js";

const { recordAdmissionDeniedAuditForAuthFailureMock } = vi.hoisted(() => ({
  recordAdmissionDeniedAuditForAuthFailureMock: vi.fn(),
}));

vi.mock("@insecur/worker-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/worker-kit")>();
  return {
    ...actual,
    recordAdmissionDeniedAuditForAuthFailure: recordAdmissionDeniedAuditForAuthFailureMock,
  };
});

import app from "./index.js";

const notAdmittedWorkosUserId = "user_not_admitted";
const notAdmittedAuthorizationCode = "code_not_admitted";
const notAdmittedCodeVerifier = "verifier_not_admitted";

// Admission resolution crosses the private Runtime Service Binding (ADR-0077); the default stub
// admits WORKOS_USER_ID. The denied-admission audit forwarder is separately mocked above, so the
// not-admitted paths assert the request-id correlation without reaching the binding.
const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  RUNTIME: createRuntimeRpcStub(),
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

function pkceExchangeSuccessEnv(authorizationCode: string, codeVerifier: string): typeof env {
  return {
    ...env,
    WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
      {
        sessionData: "sealed_unused",
        userId: WORKOS_USER_ID,
        sessionId: "session_success_test",
        authorizationCode,
        codeVerifier,
        authenticationMethod: "Passkey",
      },
    ]),
  };
}

function expectPkceExchangeSuccessBody(body: unknown): void {
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

  it("maps /cli/pkce/exchange failures to 401 via app.onError", async () => {
    const invalidPkceEnv = {
      ...env,
      WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
        {
          sessionData: "sealed_unused_invalid_pkce",
          userId: WORKOS_USER_ID,
          sessionId: "session_invalid_pkce",
          authorizationCode: "code_invalid",
          codeVerifier: "expected_verifier",
          authenticationMethod: "Passkey",
        },
      ]),
    };
    const response = await app.request(
      "/v1/auth/cli/pkce/exchange",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "code_invalid", codeVerifier: "wrong_verifier" }),
      },
      invalidPkceEnv,
    );
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expectAuthFailureEnvelope(body);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.invalid", retryable: false },
    });
  });

  it("does not leak AuthFailureError as a 500", async () => {
    const response = await app.request("/v1/session/whoami", { method: "GET" }, env);
    expect(response.status).not.toBe(500);
    const text = await response.text();
    expect(text).not.toContain("AuthFailureError");
    expect(text).not.toContain("Internal Server Error");
  });

  it("maps missing auth Worker bindings to auth.config_invalid instead of a 500 TypeError", async () => {
    const missingAuthEnv = {
      WORKOS_API_KEY: undefined,
      WORKOS_CLIENT_ID: undefined,
      WORKOS_COOKIE_PASSWORD: undefined,
      SESSION_SIGNING_SECRET: undefined,
    } as unknown as typeof env;

    const response = await app.request("/v1/session/whoami", { method: "GET" }, missingAuthEnv);
    expect(response.status).toBe(503);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "auth.config_invalid",
        retryable: false,
      },
    });
    if (typeof body !== "object" || body === null) {
      expect.fail("expected object response body");
      return;
    }
    const envelope = body as {
      error?: { message?: unknown };
      meta?: { requestId?: unknown };
    };
    expect(typeof envelope.error?.message).toBe("string");
    expect(envelope.error?.message).toContain("workos.clientId");
    expect(envelope.error?.message).not.toContain("undefined");
    expect(typeof envelope.meta?.requestId).toBe("string");
    expect(envelope.meta?.requestId).toMatch(/^req_/);
  });

  it("keeps /cli/pkce/exchange success path working", async () => {
    const response = await app.request(
      "/v1/auth/cli/pkce/exchange",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "code_success",
          codeVerifier: "verifier_success",
        }),
      },
      pkceExchangeSuccessEnv("code_success", "verifier_success"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get(INSECUR_SESSION_CREDENTIAL_HEADER)).toBeTruthy();
    expectPkceExchangeSuccessBody(await response.json());
  });

  describe("admission-denied request id correlation", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    const notAdmittedEnv = {
      ...env,
      WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
        {
          sessionData: "sealed_unused_not_admitted",
          userId: notAdmittedWorkosUserId,
          sessionId: "session_not_admitted",
          authorizationCode: notAdmittedAuthorizationCode,
          codeVerifier: notAdmittedCodeVerifier,
          authenticationMethod: "Passkey",
        },
      ]),
    };

    it("uses one request id for /cli/pkce/exchange admission-denied audit and HTTP envelope", async () => {
      const response = await app.request(
        "/v1/auth/cli/pkce/exchange",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: notAdmittedAuthorizationCode,
            codeVerifier: notAdmittedCodeVerifier,
          }),
        },
        notAdmittedEnv,
      );

      expect(response.status).toBe(401);
      const body: unknown = await response.json();
      expectAuthFailureEnvelope(body);
      expect(body).toMatchObject({
        ok: false,
        error: { code: "auth.required", retryable: false },
      });

      const responseRequestId = (body as { meta?: { requestId?: string } }).meta?.requestId;
      expect(recordAdmissionDeniedAuditForAuthFailureMock).toHaveBeenCalledTimes(1);
      expect(recordAdmissionDeniedAuditForAuthFailureMock.mock.calls[0]?.[2]).toBe(
        responseRequestId,
      );
    });
  });
});
