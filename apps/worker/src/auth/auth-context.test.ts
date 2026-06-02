import {
  exchangeCliSession,
  generateCsrfToken,
  parseRequestCredentials,
  testSessionSigningSecret,
  type InsecurAuthConfig,
} from "@insecur/auth";
import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  AuthConfigError,
  createAuthContext,
  validateAuthContext,
  type AuthConfigField,
} from "./auth-context.js";

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

const validConfig: InsecurAuthConfig = {
  workos: {
    apiKey: "sk_test",
    clientId: "client_test",
    cookiePassword: "cookie-password-at-least-32-characters",
  },
  sessionSigningSecret: testSessionSigningSecret(),
};

function expectAuthConfigError(run: () => void, field: AuthConfigField): void {
  expect(run).toThrow(AuthConfigError);
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthConfigError);
    const authError = error as AuthConfigError;
    expect(authError.field).toBe(field);
    expect(authError.message).toContain(field);
    expect(authError.message).not.toContain(validConfig.workos.apiKey);
    expect(authError.message).not.toContain(validConfig.workos.clientId);
    expect(authError.message).not.toContain(validConfig.workos.cookiePassword);
    expect(authError.message).not.toContain(validConfig.sessionSigningSecret);
  }
}

describe("validateAuthContext", () => {
  it("accepts a complete, well-formed config", () => {
    expect(() => {
      validateAuthContext(validConfig);
    }).not.toThrow();
  });

  it("rejects an empty workos.clientId", () => {
    expectAuthConfigError(() => {
      validateAuthContext({ ...validConfig, workos: { ...validConfig.workos, clientId: "" } });
    }, "workos.clientId");
  });

  it("rejects a blank workos.apiKey", () => {
    expectAuthConfigError(() => {
      validateAuthContext({ ...validConfig, workos: { ...validConfig.workos, apiKey: "   " } });
    }, "workos.apiKey");
  });

  it("rejects an empty workos.cookiePassword", () => {
    expectAuthConfigError(() => {
      validateAuthContext({
        ...validConfig,
        workos: { ...validConfig.workos, cookiePassword: "\t\n" },
      });
    }, "workos.cookiePassword");
  });

  it("rejects a sessionSigningSecret shorter than 32 characters", () => {
    expectAuthConfigError(() => {
      validateAuthContext({ ...validConfig, sessionSigningSecret: "too-short-signing-secret" });
    }, "sessionSigningSecret");
  });
});

describe("createAuthContext", () => {
  it("throws before returning when workos.clientId is empty", () => {
    expectAuthConfigError(
      () => createAuthContext({ ...env, WORKOS_CLIENT_ID: "" }),
      "workos.clientId",
    );
  });

  it("throws before returning when workos.apiKey is empty", () => {
    expectAuthConfigError(() => createAuthContext({ ...env, WORKOS_API_KEY: "" }), "workos.apiKey");
  });

  it("throws before returning when workos.cookiePassword is empty", () => {
    expectAuthConfigError(
      () => createAuthContext({ ...env, WORKOS_COOKIE_PASSWORD: "" }),
      "workos.cookiePassword",
    );
  });

  it("throws before returning when sessionSigningSecret is shorter than 32 characters", () => {
    expectAuthConfigError(
      () => createAuthContext({ ...env, SESSION_SIGNING_SECRET: "short-signing-secret-value" }),
      "sessionSigningSecret",
    );
  });

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
