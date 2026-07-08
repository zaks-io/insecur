import { AUTH_ERROR_CODES, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import type { AdmittedUserResolveContext, AdmittedUserResolver } from "./index.js";
import {
  INSECUR_API_TOKEN_AUDIENCE,
  mintEphemeralSessionCredential,
  mintScopedAccessToken,
  parseRequestCredentials,
  resolveUserActor,
} from "./index.js";
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
const otherAdmittedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5F");
const workosUserId = "user_01workos";

const resolveAdmittedUser = (externalId: string) =>
  Promise.resolve(externalId === workosUserId ? admittedUserId : null);

describe("resolveUserActor", () => {
  it("does not accept a WorkOS sealed session as a user actor credential", async () => {
    const credentials = parseRequestCredentials({
      authorizationHeader: null,
      cookieHeader: "wos-session=sealed_session_valid",
      csrfHeader: null,
    });
    const result = await resolveUserActor({
      credentials,
      config,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.required);
    }
  });

  it("returns auth.required when credentials are missing", async () => {
    const result = await resolveUserActor({
      credentials: parseRequestCredentials({
        authorizationHeader: null,
        cookieHeader: null,
        csrfHeader: null,
      }),
      config,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.required);
    }
  });

  it("resolves a valid bearer scoped access credential minted for the API audience", async () => {
    const minted = await mintScopedAccessToken({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_bff",
      },
      audience: INSECUR_API_TOKEN_AUDIENCE,
      signingSecret: config.sessionSigningSecret,
    });
    const result = await resolveUserActor({
      credentials: parseRequestCredentials({
        authorizationHeader: `Bearer ${minted.token}`,
        cookieHeader: null,
        csrfHeader: null,
      }),
      config,
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(true);
  });

  it("resolves a valid bearer ephemeral credential", async () => {
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
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(true);
  });

  it("returns not_admitted when bearer credential user is no longer admitted", async () => {
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
      resolveAdmittedUser: () => Promise.resolve(null),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("not_admitted");
      expect(result.failure.admissionDenial?.workosUserId).toBe(workosUserId);
    }
  });

  it("returns auth.invalid when bearer credential userId no longer matches admission", async () => {
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
      resolveAdmittedUser: () => Promise.resolve(otherAdmittedUserId),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.invalid);
    }
  });

  it("returns auth.invalid when the admitted resolver reports a revoked CLI session", async () => {
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
      resolveAdmittedUser: () => Promise.resolve("cli_session_revoked"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.invalid);
    }
  });

  it("skips the revocation gate and omits the session context when skipCliSessionRevocationCheck is set", async () => {
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_cli",
      },
      signingSecret: config.sessionSigningSecret,
    });
    const contexts: (AdmittedUserResolveContext | undefined)[] = [];
    const resolveWithRevokedGate: AdmittedUserResolver = (externalId, context) => {
      contexts.push(context);
      // A revocation-aware resolver only reports "cli_session_revoked" when given a session id.
      if (context !== undefined) {
        return Promise.resolve("cli_session_revoked" as const);
      }
      return Promise.resolve(externalId === workosUserId ? admittedUserId : null);
    };
    const result = await resolveUserActor({
      credentials: parseRequestCredentials({
        authorizationHeader: `Bearer ${minted.credential}`,
        cookieHeader: null,
        csrfHeader: null,
      }),
      config,
      resolveAdmittedUser: resolveWithRevokedGate,
      skipCliSessionRevocationCheck: true,
    });
    expect(result.ok).toBe(true);
    expect(contexts).toEqual([undefined]);
  });

  it("returns auth.expired for expired bearer credentials", async () => {
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
      resolveAdmittedUser,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.expired);
    }
  });
});
