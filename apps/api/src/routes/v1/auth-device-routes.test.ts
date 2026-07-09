import { INSECUR_SESSION_CREDENTIAL_HEADER, readSessionCredentialMetadata } from "@insecur/auth";
import { testSessionSigningSecret, type FakeWorkOSSessionEntry } from "@insecur/auth/testing";
import { describe, expect, it, vi } from "vitest";
import { createRuntimeRpcStub } from "../../../test/support/runtime-rpc-stub.js";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../../../test/support/setup-unit-auth.js";

vi.mock("@insecur/worker-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/worker-kit")>();
  const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
  return {
    ...actual,
    createAuthContext: (
      env: Parameters<typeof actual.createAuthContext>[0],
      options?: Parameters<typeof actual.createAuthContext>[1],
    ) => {
      const fakeSessions = (
        env as { readonly WORKOS_TEST_FAKE_SESSIONS?: readonly FakeWorkOSSessionEntry[] }
      ).WORKOS_TEST_FAKE_SESSIONS;
      return actual.createAuthContext(env, {
        ...options,
        ...(fakeSessions === undefined
          ? {}
          : { workos: createFakeWorkOSSessionPort(fakeSessions) }),
      });
    },
  };
});

const { default: app } = await import("../../index.js");

const SESSION_SIGNING_SECRET = testSessionSigningSecret();

const baseEnv = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET,
  RUNTIME: createRuntimeRpcStub(),
};

function deviceEnv(overrides: Partial<FakeWorkOSSessionEntry> = {}) {
  return {
    ...baseEnv,
    WORKOS_TEST_FAKE_SESSIONS: [
      {
        sessionData: "sealed_device",
        userId: WORKOS_USER_ID,
        sessionId: "session_device_route",
        authenticationMethod: "Passkey",
        deviceCode: "device_code_route",
        userCode: "WDJB-MJHT",
        verificationUri: "https://workos.test/device",
        verificationUriComplete: "https://workos.test/device?user_code=WDJB-MJHT",
        ...overrides,
      } satisfies FakeWorkOSSessionEntry,
    ],
  };
}

async function requestDeviceToken(
  env: ReturnType<typeof deviceEnv>,
  agentSession: boolean,
  deviceCode?: string,
) {
  const boundDeviceCode =
    deviceCode ??
    (
      await readBody(
        await app.request(
          "/v1/auth/cli/device/authorize",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentSession }),
          },
          env,
        ),
      )
    ).data.deviceCode;
  return app.request(
    "/v1/auth/cli/device/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceCode: boundDeviceCode, agentSession }),
    },
    env,
  );
}

interface DeviceRouteBody {
  readonly ok?: boolean;
  readonly data: {
    readonly userCode?: string;
    readonly verificationUri?: string;
    readonly deviceCode?: string;
    readonly status?: string;
    readonly sessionId?: string;
    readonly agentSessionId?: string;
  };
  readonly error: {
    readonly code?: string;
    readonly message?: string;
    readonly retryable?: boolean;
  };
  readonly meta?: { readonly requestId?: string };
}

async function readBody(response: Response): Promise<DeviceRouteBody> {
  const parsed: unknown = await response.json();
  return parsed as DeviceRouteBody;
}

describe("device authorization routes", () => {
  it("rejects a token poll that changes agent intent after authorization starts", async () => {
    const env = deviceEnv();
    const started = await app.request(
      "/v1/auth/cli/device/authorize",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentSession: true, requesterHost: "remote-agent-host" }),
      },
      env,
    );
    const startBody = await readBody(started);

    const response = await requestDeviceToken(env, false, startBody.data.deviceCode);

    expect(response.status).toBe(401);
    expect(response.headers.get(INSECUR_SESSION_CREDENTIAL_HEADER)).toBeNull();
  });

  it("starts device authorization with the user code and verification URLs", async () => {
    const response = await app.request(
      "/v1/auth/cli/device/authorize",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      deviceEnv(),
    );
    expect(response.status).toBe(200);
    const body = await readBody(response);
    expect(body.ok).toBe(true);
    expect(body.data.userCode).toBe("WDJB-MJHT");
    expect(body.data.verificationUri).toBe("https://workos.test/device");
    expect(body.data.deviceCode).toEqual(expect.any(String));
    expect(body.data.deviceCode).not.toBe("device_code_route");
    expect(body.meta?.requestId).toMatch(/^req_/);
  });

  it("returns the pending status while awaiting approval and never a credential header", async () => {
    const response = await requestDeviceToken(
      deviceEnv({ devicePollStates: ["authorization_pending"] }),
      false,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get(INSECUR_SESSION_CREDENTIAL_HEADER)).toBeNull();
    const body = await readBody(response);
    expect(body.data.status).toBe("authorization_pending");
    expect(body.meta?.requestId).toMatch(/^req_/);
  });

  it("mints a human session on approval and returns the credential in the header only", async () => {
    const env = deviceEnv();
    const started = await app.request(
      "/v1/auth/cli/device/authorize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": "203.0.113.9",
        },
        body: JSON.stringify({ agentSession: false, requesterHost: "developer-laptop" }),
      },
      env,
    );
    const startBody = await readBody(started);
    const response = await requestDeviceToken(env, false, startBody.data.deviceCode);
    expect(response.status).toBe(200);
    const credential = response.headers.get(INSECUR_SESSION_CREDENTIAL_HEADER);
    expect(credential).toBeTruthy();
    const text = await response.clone().text();
    // The credential must never appear in the JSON body.
    expect(text).not.toContain(credential ?? "no-credential");
    const body = await readBody(response);
    expect(body.data.sessionId).toBe("session_device_route");
    expect(body.data.agentSessionId).toBeUndefined();
    expect(body.meta?.requestId).toMatch(/^req_/);
    const metadata = await readSessionCredentialMetadata(credential ?? "", SESSION_SIGNING_SECRET);
    expect(metadata.agentMarked).toBe(false);
    expect(env.RUNTIME.recordDeviceAuthorizationAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "approved",
        actorUserId: ADMITTED_USER_ID_RAW,
        agentSession: false,
        requesterHost: "developer-laptop",
        requesterIp: "203.0.113.9",
      }),
    );
  });

  it("mints an agent-marked session when agentSession is set", async () => {
    const response = await requestDeviceToken(deviceEnv(), true);
    expect(response.status).toBe(200);
    const credential = response.headers.get(INSECUR_SESSION_CREDENTIAL_HEADER);
    expect(credential).toBeTruthy();
    const body = await readBody(response);
    expect(body.data.agentSessionId).toMatch(/^ags_[0-9A-Z]{26}$/);
    expect(body.meta?.requestId).toMatch(/^req_/);
    const metadata = await readSessionCredentialMetadata(credential ?? "", SESSION_SIGNING_SECRET);
    expect(metadata.agentMarked).toBe(true);
    expect(metadata.derivedAgentSessionId).toBe(body.data.agentSessionId);
  });

  it("maps device access denial to 403 auth.device_authorization_denied", async () => {
    const env = deviceEnv({ deviceTerminal: "denied" });
    const response = await requestDeviceToken(env, false);
    expect(response.status).toBe(403);
    const body = await readBody(response);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("auth.device_authorization_denied");
    expect(body.error.retryable).toBe(false);
    expect(body.meta?.requestId).toMatch(/^req_/);
    expect(env.RUNTIME.recordDeviceAuthorizationAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        reasonCode: "auth.device_authorization_denied",
      }),
    );
  });

  it("maps device code expiry to 401 auth.device_authorization_expired", async () => {
    const env = deviceEnv({ deviceTerminal: "expired" });
    const response = await requestDeviceToken(env, false);
    expect(response.status).toBe(401);
    const body = await readBody(response);
    expect(body.error.code).toBe("auth.device_authorization_expired");
    expect(body.error.retryable).toBe(false);
    expect(body.meta?.requestId).toMatch(/^req_/);
    expect(env.RUNTIME.recordDeviceAuthorizationAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        reasonCode: "auth.device_authorization_expired",
      }),
    );
  });

  it("rejects a missing device code with validation.invalid_command_input", async () => {
    const response = await app.request(
      "/v1/auth/cli/device/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentSession: false }),
      },
      deviceEnv(),
    );
    expect(response.status).toBe(400);
    const body = await readBody(response);
    expect(body.error.code).toBe("validation.invalid_command_input");
    expect(body.error.message).toBe("Missing device code.");
    expect(body.error.retryable).toBe(false);
  });

  it("rejects malformed and blank device token bodies", async () => {
    const cases = [
      {
        body: "{",
        message: "Expected JSON device token exchange body.",
      },
      {
        body: JSON.stringify("device_code_route"),
        message: "Expected JSON device token exchange body.",
      },
      {
        body: JSON.stringify(null),
        message: "Expected JSON device token exchange body.",
      },
      {
        body: JSON.stringify({ deviceCode: "   ", agentSession: false }),
        message: "Missing device code.",
      },
      {
        body: JSON.stringify({ deviceCode: 123, agentSession: false }),
        message: "Missing device code.",
      },
    ];

    for (const testCase of cases) {
      const response = await app.request(
        "/v1/auth/cli/device/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: testCase.body,
        },
        deviceEnv(),
      );
      expect(response.status).toBe(400);
      const body = await readBody(response);
      expect(body.error.code).toBe("validation.invalid_command_input");
      expect(body.error.message).toBe(testCase.message);
      expect(body.error.retryable).toBe(false);
    }
  });
});
