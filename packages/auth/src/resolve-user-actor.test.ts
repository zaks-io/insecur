import { AUTH_ERROR_CODES, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import {
  mintEphemeralSessionCredential,
  parseRequestCredentials,
  resolveUserActor,
} from "./index.js";
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
const workosUserId = "user_01workos";

const resolveAdmittedUser = (externalId: string) =>
  Promise.resolve(externalId === workosUserId ? admittedUserId : null);

describe("resolveUserActor", () => {
  it("resolves a valid WorkOS sealed session", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_session_valid",
        userId: workosUserId,
        sessionId: "session_browser",
        authenticationMethod: "Passkey",
      },
    ]);
    const credentials = parseRequestCredentials({
      authorizationHeader: null,
      cookieHeader: "wos-session=sealed_session_valid",
      csrfHeader: null,
    });
    const result = await resolveUserActor({
      credentials,
      config,
      workos,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe(admittedUserId);
      expect(result.actor.workosUserId).toBe(workosUserId);
    }
  });

  it("returns auth.required when credentials are missing", async () => {
    const workos = createFakeWorkOSSessionPort([]);
    const result = await resolveUserActor({
      credentials: parseRequestCredentials({
        authorizationHeader: null,
        cookieHeader: null,
        csrfHeader: null,
      }),
      config,
      workos,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.required);
    }
  });

  it("returns auth.invalid for unknown sealed session", async () => {
    const workos = createFakeWorkOSSessionPort([]);
    const result = await resolveUserActor({
      credentials: parseRequestCredentials({
        authorizationHeader: null,
        cookieHeader: "wos-session=unknown",
        csrfHeader: null,
      }),
      config,
      workos,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.invalid);
    }
  });

  it("returns auth.required when user is not admitted", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_not_admitted",
        userId: "user_not_admitted",
        sessionId: "session_x",
        authenticationMethod: "Passkey",
      },
    ]);
    const result = await resolveUserActor({
      credentials: parseRequestCredentials({
        authorizationHeader: null,
        cookieHeader: "wos-session=sealed_not_admitted",
        csrfHeader: null,
      }),
      config,
      workos,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.required);
    }
  });

  it("resolves a valid bearer ephemeral credential", async () => {
    const workos = createFakeWorkOSSessionPort([]);
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_cli",
      },
      signingSecret: config.sessionSigningSecret,
    });
    const result = await resolveUserActor({
      credentials: parseRequestCredentials({
        authorizationHeader: `Bearer ${minted.credential}`,
        cookieHeader: null,
        csrfHeader: null,
      }),
      config,
      workos,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(true);
  });

  it("returns auth.mfa_enrollment_required when no eligible MFA factors exist", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_no_mfa",
        userId: workosUserId,
        sessionId: "session_no_mfa",
        authenticationMethod: "Password",
        authFactors: [],
      },
    ]);
    const result = await resolveUserActor({
      credentials: parseRequestCredentials({
        authorizationHeader: null,
        cookieHeader: "wos-session=sealed_no_mfa",
        csrfHeader: null,
      }),
      config,
      workos,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.mfaEnrollmentRequired);
    }
  });

  it("returns auth.reauth_required for insufficient-assurance magic-auth sessions", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_magic_auth",
        userId: workosUserId,
        sessionId: "session_magic",
        authenticationMethod: "MagicAuth",
        authFactors: [{ type: "totp" }],
      },
    ]);
    const result = await resolveUserActor({
      credentials: parseRequestCredentials({
        authorizationHeader: null,
        cookieHeader: "wos-session=sealed_magic_auth",
        csrfHeader: null,
      }),
      config,
      workos,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.reauthRequired);
    }
  });

  it("returns auth.expired for expired bearer credentials", async () => {
    const workos = createFakeWorkOSSessionPort([]);
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_cli",
      },
      signingSecret: config.sessionSigningSecret,
      ttlSeconds: -5,
    });
    const result = await resolveUserActor({
      credentials: parseRequestCredentials({
        authorizationHeader: `Bearer ${minted.credential}`,
        cookieHeader: null,
        csrfHeader: null,
      }),
      config,
      workos,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.expired);
    }
  });
});
