import { createFakeWorkOSSessionPort, testSessionSigningSecret } from "@insecur/auth/testing";
import { describe, expect, it } from "vitest";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { FakeWorkOSSessionConfigError, createWorkOSSessionPortFromEnv } from "./workos-port.js";
import { createFakeAdmissionRuntime } from "./testing/fake-admission-runtime.js";

const baseEnv: AuthWorkerEnv = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  RUNTIME: createFakeAdmissionRuntime(),
};

describe("createWorkOSSessionPortFromEnv", () => {
  it("uses the real WorkOS adapter when WORKOS_FAKE_SESSIONS_JSON is absent", async () => {
    const port = createWorkOSSessionPortFromEnv(baseEnv);
    const emptyFakePort = createFakeWorkOSSessionPort([]);
    const session = "unknown-session";

    await expect(emptyFakePort.authenticateSealedSession(session)).resolves.toEqual({
      authenticated: false,
      reason: "invalid",
    });
    await expect(port.authenticateSealedSession(session)).resolves.toMatchObject({
      authenticated: false,
      reason: expect.not.stringMatching(/^invalid$/),
    });
  });

  it("rejects non-empty fake session arrays in deployable auth composition", () => {
    const env: AuthWorkerEnv = {
      ...baseEnv,
      WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
        {
          sessionData: "sealed_rejected_fake",
          userId: "user_01workos",
          sessionId: "session_01",
          email: "agent@example.com",
          authenticationMethod: "Passkey",
          authFactors: [{ type: "totp" }, { type: 42 }, null],
          authorizationCode: "code_mfa_challenge",
          codeVerifier: "verifier_mfa_challenge",
          authorizationCodeFailure: "mfa_challenge",
          rotatedSessionData: "sealed_rotated",
          refreshFailure: "expired",
        },
      ]),
    };

    expect(() => createWorkOSSessionPortFromEnv(env)).toThrow(FakeWorkOSSessionConfigError);
  });

  it("rejects malformed fake session config instead of silently falling back", () => {
    const env: AuthWorkerEnv = {
      ...baseEnv,
      WORKOS_FAKE_SESSIONS_JSON: JSON.stringify({ not: "an-array" }),
    };

    expect(() => createWorkOSSessionPortFromEnv(env)).toThrow(FakeWorkOSSessionConfigError);
  });

  it("rejects unparsable fake session config instead of silently falling back", () => {
    const env: AuthWorkerEnv = {
      ...baseEnv,
      WORKOS_FAKE_SESSIONS_JSON: "[",
    };

    expect(() => createWorkOSSessionPortFromEnv(env)).toThrow(FakeWorkOSSessionConfigError);
  });

  it("treats an empty fake session array as absent and falls back to the real adapter", async () => {
    const env: AuthWorkerEnv = {
      ...baseEnv,
      WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([]),
    };

    const port = createWorkOSSessionPortFromEnv(env);
    const emptyFakePort = createFakeWorkOSSessionPort([]);
    const session = "unknown-session";

    await expect(emptyFakePort.authenticateSealedSession(session)).resolves.toEqual({
      authenticated: false,
      reason: "invalid",
    });
    await expect(port.authenticateSealedSession(session)).resolves.toMatchObject({
      authenticated: false,
      reason: expect.not.stringMatching(/^invalid$/),
    });
  });

  it("still allows tests and local factories to wire an explicit fake WorkOS adapter", async () => {
    const sealedSession = "sealed_explicit_fake";
    const port = createFakeWorkOSSessionPort([
      {
        sessionData: sealedSession,
        userId: "user_01workos",
        sessionId: "session_explicit",
        email: "agent@example.com",
      },
    ]);

    await expect(port.authenticateSealedSession(sealedSession)).resolves.toEqual({
      authenticated: true,
      context: {
        user: { id: "user_01workos", email: "agent@example.com" },
        sessionId: "session_explicit",
        authFactors: [],
      },
    });
  });
});
