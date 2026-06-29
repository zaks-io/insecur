import { AUTH_ERROR_CODES, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { exchangeCliPkceSession } from "./index.js";
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

describe("exchangeCliPkceSession", () => {
  it("returns a credential when WorkOS code exchange and admission succeed", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_unused",
        userId: "user_01workos",
        sessionId: "session_exchange",
        authorizationCode: "code_exchange",
        codeVerifier: "verifier_exchange",
        authenticationMethod: "Passkey",
        refreshFailure: "expired",
      },
    ]);
    const result = await exchangeCliPkceSession({
      code: "code_exchange",
      codeVerifier: "verifier_exchange",
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

  it("returns auth.invalid when WorkOS rejects the code verifier", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_unused",
        userId: "user_01workos",
        sessionId: "session_exchange",
        authorizationCode: "code_exchange",
        codeVerifier: "expected_verifier",
        authenticationMethod: "Passkey",
      },
    ]);
    const result = await exchangeCliPkceSession({
      code: "code_exchange",
      codeVerifier: "wrong_verifier",
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.invalid);
    }
  });

  it("returns auth.mfa_enrollment_required when code exchange requires MFA enrollment", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_unused",
        userId: "user_01workos",
        sessionId: "session_mfa_enroll",
        authorizationCode: "code_mfa",
        codeVerifier: "verifier_mfa",
        authorizationCodeFailure: "mfa_enrollment",
      },
    ]);
    const result = await exchangeCliPkceSession({
      code: "code_mfa",
      codeVerifier: "verifier_mfa",
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.mfaEnrollmentRequired);
    }
  });

  it("returns auth.reauth_required when code exchange requires an MFA challenge", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_unused",
        userId: "user_01workos",
        sessionId: "session_mfa_challenge",
        authorizationCode: "code_mfa_challenge",
        codeVerifier: "verifier_mfa_challenge",
        authorizationCodeFailure: "mfa_challenge",
      },
    ]);
    const result = await exchangeCliPkceSession({
      code: "code_mfa_challenge",
      codeVerifier: "verifier_mfa_challenge",
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.reauthRequired);
    }
  });

  it("returns auth.required when the WorkOS user is not admitted", async () => {
    const workos = createFakeWorkOSSessionPort([
      {
        sessionData: "sealed_unused",
        userId: "user_not_admitted",
        sessionId: "session_not_admitted",
        authorizationCode: "code_not_admitted",
        codeVerifier: "verifier_not_admitted",
        authenticationMethod: "Passkey",
      },
    ]);
    const result = await exchangeCliPkceSession({
      code: "code_not_admitted",
      codeVerifier: "verifier_not_admitted",
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(null),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.required);
    }
  });
});
