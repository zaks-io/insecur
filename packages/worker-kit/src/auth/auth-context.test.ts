import {
  exchangeCliSession,
  generateCsrfToken,
  parseRequestCredentials,
  testSessionSigningSecret,
  type InsecurAuthConfig,
} from "@insecur/auth";
import { userId, type UserId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";
import {
  AuthConfigError,
  createAuthContext,
  validateAuthContext,
  type AuthConfigField,
} from "../index.js";
import type { AdmittedUserResolver } from "@insecur/auth";

vi.mock("@insecur/tenant-store", () => ({
  resolveAdmittedUserId: vi.fn(),
}));

import { resolveAdmittedUserId } from "@insecur/tenant-store";

const mockedResolveAdmittedUserId = vi.mocked(resolveAdmittedUserId);

function createFakeAdmittedUserResolver(
  admissions: Readonly<Record<string, UserId>>,
): AdmittedUserResolver {
  const admitted = new Map(Object.entries(admissions));
  return (workosUserId: string) => Promise.resolve(admitted.get(workosUserId) ?? null);
}

const admittedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const workosUserId = "user_01workos";
const sealedSession = "sealed_auth_context_test";

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
    {
      sessionData: sealedSession,
      userId: workosUserId,
      sessionId: "session_context_test",
      authenticationMethod: "Passkey",
    },
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

  it("rejects a blank sessionSigningSecret even when padded to 32 characters", () => {
    expectAuthConfigError(() => {
      validateAuthContext({
        ...validConfig,
        sessionSigningSecret: "                                ",
      });
    }, "sessionSigningSecret");
  });

  it("rejects a sessionSigningSecret shorter than 32 characters", () => {
    expectAuthConfigError(() => {
      validateAuthContext({ ...validConfig, sessionSigningSecret: "too-short-signing-secret" });
    }, "sessionSigningSecret");
  });

  it("rejects undefined workos.clientId", () => {
    expectAuthConfigError(() => {
      validateAuthContext({
        ...validConfig,
        workos: { ...validConfig.workos, clientId: undefined as unknown as string },
      });
    }, "workos.clientId");
  });

  it("rejects undefined workos.apiKey", () => {
    expectAuthConfigError(() => {
      validateAuthContext({
        ...validConfig,
        workos: { ...validConfig.workos, apiKey: undefined as unknown as string },
      });
    }, "workos.apiKey");
  });

  it("rejects undefined workos.cookiePassword", () => {
    expectAuthConfigError(() => {
      validateAuthContext({
        ...validConfig,
        workos: { ...validConfig.workos, cookiePassword: undefined as unknown as string },
      });
    }, "workos.cookiePassword");
  });

  it("rejects undefined sessionSigningSecret", () => {
    expectAuthConfigError(() => {
      validateAuthContext({
        ...validConfig,
        sessionSigningSecret: undefined as unknown as string,
      });
    }, "sessionSigningSecret");
  });
});

describe("createAuthContext", () => {
  it("defaults to store-backed admission resolution", async () => {
    mockedResolveAdmittedUserId.mockResolvedValueOnce(admittedUserId);
    const { resolveAdmittedUser } = createAuthContext(env);
    await expect(resolveAdmittedUser(workosUserId)).resolves.toBe(admittedUserId);
    expect(mockedResolveAdmittedUserId).toHaveBeenCalledWith("inst_LOCAL_DEV", workosUserId);
  });

  it("uses a custom admitted-user resolver when provided", async () => {
    const context = createAuthContext(env, {
      resolveAdmittedUser: createFakeAdmittedUserResolver({ [workosUserId]: admittedUserId }),
    });
    await expect(context.resolveAdmittedUser(workosUserId)).resolves.toBe(admittedUserId);
  });

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

  it("throws before returning when sessionSigningSecret is blank but 32 characters long", () => {
    expectAuthConfigError(
      () =>
        createAuthContext({ ...env, SESSION_SIGNING_SECRET: "                                " }),
      "sessionSigningSecret",
    );
  });

  it("throws before returning when Worker auth bindings are missing", () => {
    expectAuthConfigError(
      () =>
        createAuthContext({
          WORKOS_API_KEY: undefined as unknown as string,
          WORKOS_CLIENT_ID: undefined as unknown as string,
          WORKOS_COOKIE_PASSWORD: undefined as unknown as string,
          SESSION_SIGNING_SECRET: undefined as unknown as string,
        }),
      "workos.clientId",
    );
  });

  it("throws before returning when WORKOS_CLIENT_ID is undefined", () => {
    expectAuthConfigError(
      () => createAuthContext({ ...env, WORKOS_CLIENT_ID: undefined as unknown as string }),
      "workos.clientId",
    );
  });

  it("composes config, workos, and admitted-user resolution for auth entry points", async () => {
    const { config, workos, resolveAdmittedUser } = createAuthContext(env, {
      resolveAdmittedUser: createFakeAdmittedUserResolver({ [workosUserId]: admittedUserId }),
    });
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
    });
    expect(exchanged.ok).toBe(true);
    if (exchanged.ok) {
      expect(exchanged.body.sessionId).toBe("session_context_test");
    }
  });
});
