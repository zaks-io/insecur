import {
  exchangeCliSession,
  generateCsrfToken,
  parseRequestCredentials,
  testSessionSigningSecret,
} from "@insecur/auth";
import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { createAuthContext } from "./auth-context.js";

const admittedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const workosUserId = "user_01workos";
const sealedSession = "sealed_auth_context_test";

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  ADMITTED_USER_MAP_JSON: JSON.stringify({ [workosUserId]: admittedUserId }),
  WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
    { sessionData: sealedSession, userId: workosUserId, sessionId: "session_context_test" },
  ]),
};

describe("createAuthContext", () => {
  it("composes config, workos, and admitted-user resolution for auth entry points", async () => {
    const { config, workos, resolveAdmittedUser } = createAuthContext(env);
    expect(config.sessionSigningSecret).toBe(env.SESSION_SIGNING_SECRET);
    await expect(resolveAdmittedUser(workosUserId)).resolves.toBe(admittedUserId);

    const csrf = generateCsrfToken();
    const exchanged = await exchangeCliSession({
      credentials: parseRequestCredentials({
        authorizationHeader: undefined,
        cookieHeader: `wos-session=${sealedSession}; insecur_csrf=${csrf}`,
        csrfHeader: csrf,
      }),
      config,
      workos,
      resolveAdmittedUser,
      requireCsrf: true,
    });
    expect(exchanged.ok).toBe(true);
    if (exchanged.ok) {
      expect(exchanged.body.sessionId).toBe("session_context_test");
    }
  });
});
