import { createFakeWorkOSSessionPort, testSessionSigningSecret } from "@insecur/auth";
import { describe, expect, it } from "vitest";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";
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

  it("parses valid fake session entries and ignores malformed ones", async () => {
    const sealedSession = "sealed_fake_session";
    const env: AuthWorkerEnv = {
      ...baseEnv,
      WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
        {
          sessionData: sealedSession,
          userId: "user_01workos",
          sessionId: "session_01",
          email: "agent@example.com",
          authenticationMethod: "Passkey",
          authFactors: [{ type: "totp" }, { type: 42 }, null],
          rotatedSessionData: "sealed_rotated",
          refreshFailure: "expired",
        },
        { sessionData: "incomplete" },
        "not-an-object",
        null,
      ]),
    };

    const port = createWorkOSSessionPortFromEnv(env);
    await expect(port.authenticateSealedSession(sealedSession)).resolves.toEqual({
      authenticated: true,
      context: {
        user: { id: "user_01workos", email: "agent@example.com" },
        sessionId: "session_01",
        authenticationMethod: "Passkey",
        authFactors: [{ type: "totp" }],
      },
    });
    await expect(port.refreshSealedSession(sealedSession)).resolves.toEqual({
      refreshed: false,
      reason: "expired",
    });
    await expect(port.listAuthFactors("user_01workos")).resolves.toEqual([{ type: "totp" }]);
  });

  it("treats non-array fake session JSON as empty and falls back to the real adapter", async () => {
    const env: AuthWorkerEnv = {
      ...baseEnv,
      WORKOS_FAKE_SESSIONS_JSON: JSON.stringify({ not: "an-array" }),
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

  it("ignores optional fields with invalid types while keeping required session fields", async () => {
    const sealedSession = "sealed_minimal";
    const env: AuthWorkerEnv = {
      ...baseEnv,
      WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
        {
          sessionData: sealedSession,
          userId: "user_minimal",
          sessionId: "session_minimal",
          email: 42,
          authenticationMethod: 99,
          authFactors: "not-an-array",
          rotatedSessionData: 1,
          refreshFailure: "unsupported",
        },
      ]),
    };

    const port = createWorkOSSessionPortFromEnv(env);
    await expect(port.authenticateSealedSession(sealedSession)).resolves.toEqual({
      authenticated: true,
      context: {
        user: { id: "user_minimal" },
        sessionId: "session_minimal",
        authFactors: [],
      },
    });
    await expect(port.refreshSealedSession(sealedSession)).resolves.toMatchObject({
      refreshed: true,
      sealedSession: `${sealedSession}_rotated`,
    });
  });
});
