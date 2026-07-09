import { AUTH_ERROR_CODES, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { exchangeCliDeviceSession, startCliDeviceAuthorization } from "./index.js";
import { readSessionCredentialMetadata } from "./session-credential-metadata.js";
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

function deviceWorkos(overrides: Record<string, unknown> = {}) {
  return createFakeWorkOSSessionPort([
    {
      sessionData: "sealed_device",
      userId: "user_01workos",
      sessionId: "session_device",
      authenticationMethod: "Passkey",
      deviceCode: "device_code_abc",
      userCode: "WDJB-MJHT",
      verificationUri: "https://workos.test/device",
      verificationUriComplete: "https://workos.test/device?user_code=WDJB-MJHT",
      ...overrides,
    },
  ]);
}

describe("startCliDeviceAuthorization", () => {
  it("returns the user code and verification URLs for the CLI to display", async () => {
    const start = await startCliDeviceAuthorization(deviceWorkos());
    expect(start.userCode).toBe("WDJB-MJHT");
    expect(start.verificationUri).toBe("https://workos.test/device");
    expect(start.verificationUriComplete).toBe("https://workos.test/device?user_code=WDJB-MJHT");
    expect(start.deviceCode).toBe("device_code_abc");
    expect(start.intervalSeconds).toBeGreaterThan(0);
  });
});

describe("exchangeCliDeviceSession", () => {
  it("polls through pending and slow_down before returning a credential on approval", async () => {
    const workos = deviceWorkos({
      devicePollStates: ["authorization_pending", "slow_down"],
    });
    const pending = await exchangeCliDeviceSession({
      deviceCode: "device_code_abc",
      agentSession: false,
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(pending).toMatchObject({ ok: true, status: "authorization_pending" });

    const slowDown = await exchangeCliDeviceSession({
      deviceCode: "device_code_abc",
      agentSession: false,
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(slowDown).toMatchObject({ ok: true, status: "slow_down" });

    const authenticated = await exchangeCliDeviceSession({
      deviceCode: "device_code_abc",
      agentSession: false,
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(authenticated.ok).toBe(true);
    if (authenticated.ok && authenticated.status === "authenticated") {
      expect(authenticated.credential.length).toBeGreaterThan(20);
      expect(authenticated.body.sessionId).toBe("session_device");
      expect(authenticated.body.agentSessionId).toBeUndefined();
      const metadata = await readSessionCredentialMetadata(
        authenticated.credential,
        config.sessionSigningSecret,
      );
      expect(metadata.agentMarked).toBe(false);
    }
  });

  it("mints an agent-marked session with a fresh agent session id when agentSession is set", async () => {
    const workos = deviceWorkos();
    const result = await exchangeCliDeviceSession({
      deviceCode: "device_code_abc",
      agentSession: true,
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.status === "authenticated") {
      expect(result.body.agentSessionId).toMatch(/^ags_[0-9A-Z]{26}$/);
      const metadata = await readSessionCredentialMetadata(
        result.credential,
        config.sessionSigningSecret,
      );
      expect(metadata.agentMarked).toBe(true);
      expect(metadata.derivedAgentSessionId).toBe(result.body.agentSessionId);
    }
  });

  it("returns auth.device_authorization_denied when the user rejects the request", async () => {
    const workos = deviceWorkos({ deviceTerminal: "denied" });
    const result = await exchangeCliDeviceSession({
      deviceCode: "device_code_abc",
      agentSession: false,
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.deviceAuthorizationDenied);
    }
  });

  it("returns auth.device_authorization_expired when the device code expires", async () => {
    const workos = deviceWorkos({ deviceTerminal: "expired" });
    const result = await exchangeCliDeviceSession({
      deviceCode: "device_code_abc",
      agentSession: false,
      config,
      workos,
      resolveAdmittedUser: () => Promise.resolve(admittedUserId),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe(AUTH_ERROR_CODES.deviceAuthorizationExpired);
    }
  });

  it("returns auth.required when the approved WorkOS user is not admitted", async () => {
    const workos = deviceWorkos();
    const result = await exchangeCliDeviceSession({
      deviceCode: "device_code_abc",
      agentSession: false,
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
