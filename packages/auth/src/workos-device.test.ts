import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateDeviceCodeWithWorkOS,
  startDeviceAuthorizationWithWorkOS,
  type WorkOSDeviceDeps,
} from "./workos-device.js";
import type { WorkOSSessionContext } from "./workos-session-port.js";

const config = {
  apiKey: "sk_test_device",
  clientId: "client_test",
  cookiePassword: "cookie-password-at-least-32-characters",
};

const deps: WorkOSDeviceDeps = {
  sessionIdFromAccessToken: () => "session_from_token",
  listAuthFactors: () => Promise.resolve([]),
  buildContext: (user, sessionId, authenticationMethod, authFactors): WorkOSSessionContext => ({
    user: user.email === undefined ? { id: user.id } : { id: user.id, email: user.email },
    sessionId,
    authFactors,
    ...(authenticationMethod === undefined ? {} : { authenticationMethod }),
  }),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headerRecord(init: RequestInit | undefined): Record<string, string> {
  const headers = init?.headers;
  if (headers === undefined) {
    return {};
  }
  return headers as Record<string, string>;
}

function requestUrl(input: RequestInfo | URL | undefined): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input instanceof Request ? input.url : "";
}

describe("startDeviceAuthorizationWithWorkOS", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the WorkOS API key as an Authorization: Bearer header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        device_code: "device_code_abc",
        user_code: "WDJB-MJHT",
        verification_uri: "https://workos.test/device",
        expires_in: 300,
        interval: 5,
      }),
    );

    const result = await startDeviceAuthorizationWithWorkOS(config);
    expect(result.userCode).toBe("WDJB-MJHT");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl(url)).toContain("/user_management/authorize/device");
    expect(headerRecord(init).Authorization).toBe("Bearer sk_test_device");
    expect(headerRecord(init)["Content-Type"]).toBe("application/json");
  });
});

describe("authenticateDeviceCodeWithWorkOS", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the API key bearer header on the token poll", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ access_token: "at_x.y.z", user: { id: "user_01workos" } }));

    await authenticateDeviceCodeWithWorkOS(config, deps, "device_code_abc");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl(url)).toContain("/user_management/authenticate");
    expect(headerRecord(init).Authorization).toBe("Bearer sk_test_device");
  });

  it("authenticates on a device response with NO sealed_session (real WorkOS device-grant shape)", async () => {
    // The real WorkOS device-code grant returns access_token/refresh_token/user but no sealed
    // session. This regression asserts a successful auth is not misclassified as invalid.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        access_token: "at_x.y.z",
        refresh_token: "rt_123",
        user: { id: "user_01workos", email: "dev@example.com" },
        organization_id: "org_123",
        authentication_method: "Passkey",
      }),
    );

    const result = await authenticateDeviceCodeWithWorkOS(config, deps, "device_code_abc");
    expect(result.status).toBe("authenticated");
    if (result.status === "authenticated") {
      expect(result.context.sessionId).toBe("session_from_token");
      expect(result.context.user.id).toBe("user_01workos");
      expect(result.context.authenticationMethod).toBe("Passkey");
    }
  });

  it("maps the WorkOS 400 poll error codes to poll states", async () => {
    const cases: { error: string; expected: string }[] = [
      { error: "authorization_pending", expected: "authorization_pending" },
      { error: "slow_down", expected: "slow_down" },
      { error: "access_denied", expected: "denied" },
      { error: "expired_token", expected: "expired" },
      { error: "invalid_client", expected: "invalid" },
    ];
    for (const testCase of cases) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonResponse({ error: testCase.error }, 400),
      );
      const result = await authenticateDeviceCodeWithWorkOS(config, deps, "device_code_abc");
      expect(result.status).toBe(testCase.expected);
    }
  });

  it("returns invalid when access_token or user is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ user: { id: "user_01workos" } }),
    );
    const result = await authenticateDeviceCodeWithWorkOS(config, deps, "device_code_abc");
    expect(result.status).toBe("invalid");
  });
});
