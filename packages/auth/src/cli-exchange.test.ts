import { AUTH_ERROR_CODES, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { exchangeCliSession, generateCsrfToken, parseRequestCredentials } from "./index.js";
import { createFakeWorkOSSessionPort } from "./testing/fake-workos-session.js";
import { testSessionSigningSecret } from "./testing/test-session-signing-secret.js";

const config = {
  workos: {
    apiKey: "sk_test",
    clientId: "client_test",
    cookiePassword: "cookie-password-at-least-32-characters",
  },
  sessionSigningSecret: testSessionSigningSecret(),
};

const admittedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");

describe("exchangeCliSession", () => {
  it("returns a credential when WorkOS session and CSRF are valid", async () => {
    const csrf = generateCsrfToken();
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_for_exchange",
        userId: "user_01workos",
        sessionId: "session_exchange",
      },
    ]);
    const result = await exchangeCliSession({
      credentials: parseRequestCredentials({
        authorizationHeader: null,
        cookieHeader: `wos-session=sealed_for_exchange; insecur_csrf=${csrf}`,
        csrfHeader: csrf,
      }),
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credential.length).toBeGreaterThan(20);
      expect(result.body.sessionId).toBe("session_exchange");
    }
  });

  it("returns auth.invalid when CSRF does not match", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_for_exchange",
        userId: "user_01workos",
        sessionId: "session_exchange",
      },
    ]);
    const result = await exchangeCliSession({
      credentials: parseRequestCredentials({
        authorizationHeader: null,
        cookieHeader: "wos-session=sealed_for_exchange; insecur_csrf=abc",
        csrfHeader: "def",
      }),
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.invalid);
    }
  });

  it("returns auth.required when WorkOS cookie is absent", async () => {
    const csrf = generateCsrfToken();
    const workos = createFakeWorkOSSessionPort([]);
    const result = await exchangeCliSession({
      credentials: parseRequestCredentials({
        authorizationHeader: null,
        cookieHeader: `insecur_csrf=${csrf}`,
        csrfHeader: csrf,
      }),
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.required);
    }
  });
});
