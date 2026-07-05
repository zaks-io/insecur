import { mintEphemeralSessionCredential, WORKOS_SESSION_COOKIE } from "@insecur/auth";
import { createFakeWorkOSSessionPort, testSessionSigningSecret } from "@insecur/auth/testing";
import { requestId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebEnv } from "../env.js";
import type { RuntimeAdmissionRpc } from "../runtime/admission-types.js";
import { hasWorkosSessionCookie, resolveBrowserActor } from "./resolve-browser-actor.js";

const instanceId = "inst_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const workosUserId = "user_01workos";
const sealedSession = "sealed-session-admitted-test";
const signingSecret = testSessionSigningSecret();
const admittedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");

function createTestRuntime(admissions: Readonly<Record<string, ReturnType<typeof userId.brand>>>) {
  const admitted = new Map(Object.entries(admissions));
  const deniedCalls: {
    instanceId: string;
    workosUserId: string;
    requestId: ReturnType<typeof requestId.brand>;
  }[] = [];
  const runtime: RuntimeAdmissionRpc = {
    resolveAdmission: (input) =>
      Promise.resolve({
        ok: true,
        value: { userId: admitted.get(input.workosUserId) ?? null },
      }),
    recordAdmissionDenied: (input) => {
      deniedCalls.push(input);
      return Promise.resolve({ ok: true, value: { recorded: true } });
    },
  };
  return { runtime, deniedCalls };
}

function createTestEnv(runtime: RuntimeAdmissionRpc, overrides: Partial<WebEnv> = {}): WebEnv {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: signingSecret,
    INSTANCE_ID: instanceId,
    API: { fetch: () => Promise.reject(new Error("API binding not used")) } as unknown as Fetcher,
    RUNTIME: runtime,
    ...overrides,
  };
}

const workosPortMock = vi.hoisted(() => ({
  createWorkOSSessionPortFromEnv: vi.fn(),
}));

const setResponseHeaderMock = vi.hoisted(() => vi.fn());

vi.mock("./workos-port.js", () => workosPortMock);
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: setResponseHeaderMock,
}));

function sessionRequest(): Request {
  return new Request("https://insecur.test/whoami", {
    headers: {
      Cookie: `${WORKOS_SESSION_COOKIE}=${sealedSession}`,
    },
  });
}

function bearerRequest(credential: string): Request {
  return new Request("https://insecur.test/whoami", {
    headers: {
      Authorization: `Bearer ${credential}`,
    },
  });
}

function sessionAndBearerRequest(credential: string): Request {
  return new Request("https://insecur.test/whoami", {
    headers: {
      Authorization: `Bearer ${credential}`,
      Cookie: `${WORKOS_SESSION_COOKIE}=${sealedSession}`,
    },
  });
}

async function smokeCredential(ttlSeconds?: number): Promise<string> {
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admittedUserId,
      workosUserId,
      sessionId: "session_web_smoke",
    },
    signingSecret,
    ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
  });
  return minted.credential;
}

describe("hasWorkosSessionCookie", () => {
  it("detects the WorkOS sealed session cookie", () => {
    const request = new Request("https://insecur.test/whoami", {
      headers: { Cookie: "wos-session=sealed; insecur_csrf=abc" },
    });
    expect(hasWorkosSessionCookie(request)).toBe(true);
  });

  it("returns false when the session cookie is absent", () => {
    const request = new Request("https://insecur.test/whoami");
    expect(hasWorkosSessionCookie(request)).toBe(false);
  });
});

describe("resolveBrowserActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setResponseHeaderMock.mockReset();
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([
        {
          sessionData: sealedSession,
          userId: workosUserId,
          sessionId: "session_web",
          authFactors: [{ type: "totp" }],
        },
      ]),
    );
  });

  it("returns missing when neither WorkOS cookie nor accepted smoke bearer is present", async () => {
    const { runtime } = createTestRuntime({});
    const result = await resolveBrowserActor(
      new Request("https://insecur.test/whoami"),
      createTestEnv(runtime),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("missing");
    }
  });

  it("forwards denied-admission audit metadata over the Runtime binding", async () => {
    const { runtime, deniedCalls } = createTestRuntime({});
    const result = await resolveBrowserActor(sessionRequest(), createTestEnv(runtime));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("not_admitted");
      expect(result.failure.admissionDenial?.workosUserId).toBe(workosUserId);
    }
    expect(deniedCalls).toHaveLength(1);
    expect(deniedCalls[0]?.instanceId).toBe(instanceId);
    expect(deniedCalls[0]?.workosUserId).toBe(workosUserId);
    expect(deniedCalls[0]?.requestId).toMatch(/^req_/u);
  });

  it("returns an admitted actor when Runtime admission resolves a user", async () => {
    const { runtime } = createTestRuntime({ [workosUserId]: admittedUserId });
    const result = await resolveBrowserActor(sessionRequest(), createTestEnv(runtime));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe(admittedUserId);
      expect(result.actor.workosUserId).toBe(workosUserId);
    }
  });

  it("accepts a smoke bearer only when preview smoke credentials are enabled", async () => {
    const { runtime } = createTestRuntime({ [workosUserId]: admittedUserId });
    const result = await resolveBrowserActor(
      bearerRequest(await smokeCredential()),
      createTestEnv(runtime, { PREVIEW_SMOKE_SESSION_CREDENTIALS: "true" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe(admittedUserId);
      expect(result.actor.workosUserId).toBe(workosUserId);
      expect(result.actor.sessionId).toBe("session_web_smoke");
    }
  });

  it("does not accept a smoke bearer when preview smoke credentials are disabled", async () => {
    const { runtime } = createTestRuntime({ [workosUserId]: admittedUserId });
    const result = await resolveBrowserActor(
      bearerRequest(await smokeCredential()),
      createTestEnv(runtime),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("missing");
    }
  });

  it("rejects invalid and expired smoke bearers when preview smoke credentials are enabled", async () => {
    const { runtime } = createTestRuntime({ [workosUserId]: admittedUserId });
    const env = createTestEnv(runtime, { PREVIEW_SMOKE_SESSION_CREDENTIALS: "true" });

    const invalid = await resolveBrowserActor(bearerRequest("not-a-session-token"), env);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.failure.reason).toBe("invalid");
    }

    const expired = await resolveBrowserActor(bearerRequest(await smokeCredential(0)), env);
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.failure.reason).toBe("expired");
    }
  });

  it("falls back to the WorkOS cookie when preview receives an invalid smoke bearer", async () => {
    const { runtime } = createTestRuntime({ [workosUserId]: admittedUserId });
    const result = await resolveBrowserActor(
      sessionAndBearerRequest("not-a-session-token"),
      createTestEnv(runtime, { PREVIEW_SMOKE_SESSION_CREDENTIALS: "true" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe(admittedUserId);
      expect(result.actor.workosUserId).toBe(workosUserId);
      expect(result.actor.sessionId).toBe("session_web");
    }
  });

  it("refreshes an expired sealed session and returns rotation cookies", async () => {
    const expiredSession = "sealed-session-expired-refresh";
    const rotatedSession = "sealed-session-rotated";
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([
        {
          sessionData: expiredSession,
          userId: workosUserId,
          sessionId: "session_web_refresh",
          authenticateFailure: "expired",
          rotatedSessionData: rotatedSession,
          authFactors: [{ type: "totp" }],
        },
        {
          sessionData: rotatedSession,
          userId: workosUserId,
          sessionId: "session_web_refresh",
          authFactors: [{ type: "totp" }],
        },
      ]),
    );
    const { runtime } = createTestRuntime({ [workosUserId]: admittedUserId });
    const request = new Request("https://insecur.test/whoami", {
      headers: { Cookie: `${WORKOS_SESSION_COOKIE}=${expiredSession}` },
    });

    const result = await resolveBrowserActor(request, createTestEnv(runtime));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.sessionId).toBe("session_web_refresh");
      expect(result.rotation?.sealedSession).toBe(rotatedSession);
      expect(result.rotation?.csrfToken).toMatch(/^[A-Za-z0-9_-]+$/u);
    }
  });

  it("clears stale browser cookies when refresh succeeds but admission fails", async () => {
    const expiredSession = "sealed-session-expired-denied";
    const rotatedSession = "sealed-session-rotated-denied";
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([
        {
          sessionData: expiredSession,
          userId: workosUserId,
          sessionId: "session_web_refresh_denied",
          authenticateFailure: "expired",
          rotatedSessionData: rotatedSession,
          authFactors: [{ type: "totp" }],
        },
        {
          sessionData: rotatedSession,
          userId: workosUserId,
          sessionId: "session_web_refresh_denied",
          authFactors: [{ type: "totp" }],
        },
      ]),
    );
    const { runtime } = createTestRuntime({});
    const request = new Request("https://insecur.test/whoami", {
      headers: { Cookie: `${WORKOS_SESSION_COOKIE}=${expiredSession}` },
    });

    const result = await resolveBrowserActor(request, createTestEnv(runtime));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("not_admitted");
      expect(result.clearSession).toBe(true);
    }
    expect(setResponseHeaderMock).toHaveBeenCalledWith("Set-Cookie", expect.any(Array));
  });

  it("clears stale browser cookies when refresh succeeds but post-refresh assurance fails", async () => {
    const expiredSession = "sealed-session-expired-assurance";
    const rotatedSession = "sealed-session-rotated-assurance";
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([
        {
          sessionData: expiredSession,
          userId: workosUserId,
          sessionId: "session_web_refresh_assurance",
          authenticateFailure: "expired",
          rotatedSessionData: rotatedSession,
          authenticationMethod: "MagicAuth",
          authFactors: [{ type: "totp" }],
        },
        {
          sessionData: rotatedSession,
          userId: workosUserId,
          sessionId: "session_web_refresh_assurance",
          authenticationMethod: "MagicAuth",
          authFactors: [{ type: "totp" }],
        },
      ]),
    );
    const { runtime } = createTestRuntime({ [workosUserId]: admittedUserId });
    const request = new Request("https://insecur.test/whoami", {
      headers: { Cookie: `${WORKOS_SESSION_COOKIE}=${expiredSession}` },
    });

    const result = await resolveBrowserActor(request, createTestEnv(runtime));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("insufficient_assurance");
      expect(result.clearSession).toBe(true);
    }
  });

  it("does not clear browser cookies when admission fails without refresh", async () => {
    const { runtime } = createTestRuntime({});
    const result = await resolveBrowserActor(sessionRequest(), createTestEnv(runtime));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("not_admitted");
      expect(result.clearSession).toBeUndefined();
    }
  });

  it("resolves once per request so a stale cookie is not re-authenticated after refresh", async () => {
    const expiredSession = "sealed-session-expired-memo";
    const rotatedSession = "sealed-session-rotated-memo";
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([
        {
          sessionData: expiredSession,
          userId: workosUserId,
          sessionId: "session_web_refresh_memo",
          authenticateFailure: "expired",
          rotatedSessionData: rotatedSession,
          authFactors: [{ type: "totp" }],
        },
        {
          sessionData: rotatedSession,
          userId: workosUserId,
          sessionId: "session_web_refresh_memo",
          authFactors: [{ type: "totp" }],
        },
      ]),
    );
    const { runtime } = createTestRuntime({ [workosUserId]: admittedUserId });
    const request = new Request("https://insecur.test/whoami", {
      headers: { Cookie: `${WORKOS_SESSION_COOKIE}=${expiredSession}` },
    });
    const env = createTestEnv(runtime);

    const first = await resolveBrowserActor(request, env);
    const second = await resolveBrowserActor(request, env);

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(workosPortMock.createWorkOSSessionPortFromEnv).toHaveBeenCalledTimes(1);
    expect(setResponseHeaderMock).toHaveBeenCalledTimes(1);
  });
});
