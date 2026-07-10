import { INSECUR_CSRF_COOKIE } from "@insecur/auth";
import { createFakeWorkOSSessionPort, type FakeWorkOSSessionEntry } from "@insecur/auth/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAKE_ADMITTED_USER_ID,
  FAKE_SEALED_SESSION,
  FAKE_WORKOS_USER_ID,
  fakeSessionEntry,
  mintFakeSmokeBearer,
} from "../../test/support/fake-browser-session.js";
import {
  createFakeRuntimeAdmissionBinding,
  createFakeWebEnv,
  FAKE_INSTANCE_ID,
} from "../../test/support/fake-web-env.js";
import { ssrRequest } from "../../test/support/ssr-request.js";
import { hasWorkosSessionCookie, resolveBrowserActor } from "./resolve-browser-actor.js";

const workosPortMock = vi.hoisted(() => ({
  createWorkOSSessionPortFromEnv: vi.fn(),
}));

const setResponseHeaderMock = vi.hoisted(() => vi.fn());

vi.mock("./workos-port.js", () => workosPortMock);
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: setResponseHeaderMock,
}));

const sessionEntry = fakeSessionEntry({ sessionId: "session_web" });

function sessionRequest(): Request {
  return ssrRequest("/whoami", { sessionCookie: FAKE_SEALED_SESSION });
}

describe("hasWorkosSessionCookie", () => {
  it("detects the WorkOS sealed session cookie", () => {
    const request = ssrRequest("/whoami", {
      sessionCookie: "sealed",
      headers: { Cookie: `${INSECUR_CSRF_COOKIE}=abc` },
    });
    expect(hasWorkosSessionCookie(request)).toBe(true);
  });

  it("returns false when the session cookie is absent", () => {
    expect(hasWorkosSessionCookie(ssrRequest("/whoami"))).toBe(false);
  });
});

describe("resolveBrowserActor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setResponseHeaderMock.mockReset();
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([sessionEntry]),
    );
  });

  it("returns missing when neither WorkOS cookie nor accepted smoke bearer is present", async () => {
    const result = await resolveBrowserActor(ssrRequest("/whoami"), createFakeWebEnv());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("missing");
    }
  });

  it("forwards denied-admission audit metadata over the Runtime binding", async () => {
    const { runtime, deniedCalls } = createFakeRuntimeAdmissionBinding();
    const result = await resolveBrowserActor(
      sessionRequest(),
      createFakeWebEnv({ RUNTIME: runtime }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("not_admitted");
      expect(result.failure.admissionDenial?.workosUserId).toBe(FAKE_WORKOS_USER_ID);
    }
    expect(deniedCalls).toHaveLength(1);
    expect(deniedCalls[0]?.instanceId).toBe(FAKE_INSTANCE_ID);
    expect(deniedCalls[0]?.workosUserId).toBe(FAKE_WORKOS_USER_ID);
    expect(deniedCalls[0]?.requestId).toMatch(/^req_/u);
  });

  it("returns an admitted actor when Runtime admission resolves a user", async () => {
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const result = await resolveBrowserActor(
      sessionRequest(),
      createFakeWebEnv({ RUNTIME: runtime }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe(FAKE_ADMITTED_USER_ID);
      expect(result.actor.workosUserId).toBe(FAKE_WORKOS_USER_ID);
    }
  });

  it("accepts a smoke bearer only when preview smoke credentials are enabled", async () => {
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const result = await resolveBrowserActor(
      ssrRequest("/whoami", { bearer: await mintFakeSmokeBearer() }),
      createFakeWebEnv({ RUNTIME: runtime, PREVIEW_SMOKE_SESSION_CREDENTIALS: "true" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe(FAKE_ADMITTED_USER_ID);
      expect(result.actor.workosUserId).toBe(FAKE_WORKOS_USER_ID);
      expect(result.actor.sessionId).toBe("session_web_smoke");
    }
  });

  it("does not accept a smoke bearer when preview smoke credentials are disabled", async () => {
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const result = await resolveBrowserActor(
      ssrRequest("/whoami", { bearer: await mintFakeSmokeBearer() }),
      createFakeWebEnv({ RUNTIME: runtime }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("missing");
    }
  });

  it("rejects invalid and expired smoke bearers when preview smoke credentials are enabled", async () => {
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const env = createFakeWebEnv({ RUNTIME: runtime, PREVIEW_SMOKE_SESSION_CREDENTIALS: "true" });

    const invalid = await resolveBrowserActor(
      ssrRequest("/whoami", { bearer: "not-a-session-token" }),
      env,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.failure.reason).toBe("invalid");
    }

    const expired = await resolveBrowserActor(
      ssrRequest("/whoami", { bearer: await mintFakeSmokeBearer(0) }),
      env,
    );
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.failure.reason).toBe("expired");
    }
  });

  it("falls back to the WorkOS cookie when preview receives an invalid smoke bearer", async () => {
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const result = await resolveBrowserActor(
      ssrRequest("/whoami", { sessionCookie: FAKE_SEALED_SESSION, bearer: "not-a-session-token" }),
      createFakeWebEnv({ RUNTIME: runtime, PREVIEW_SMOKE_SESSION_CREDENTIALS: "true" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.userId).toBe(FAKE_ADMITTED_USER_ID);
      expect(result.actor.workosUserId).toBe(FAKE_WORKOS_USER_ID);
      expect(result.actor.sessionId).toBe("session_web");
    }
  });

  function useRefreshableSession(sessionId: string, options: Partial<FakeWorkOSSessionEntry> = {}) {
    const expiredSession = `sealed-session-expired-${sessionId}`;
    const rotatedSession = `sealed-session-rotated-${sessionId}`;
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([
        fakeSessionEntry({
          sessionData: expiredSession,
          sessionId,
          authenticateFailure: "expired",
          rotatedSessionData: rotatedSession,
          ...options,
        }),
        fakeSessionEntry({ sessionData: rotatedSession, sessionId, ...options }),
      ]),
    );
    return { expiredSession, rotatedSession };
  }

  it("refreshes an expired sealed session and returns rotation cookies", async () => {
    const { expiredSession, rotatedSession } = useRefreshableSession("session_web_refresh");
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });

    const result = await resolveBrowserActor(
      ssrRequest("/whoami", { sessionCookie: expiredSession }),
      createFakeWebEnv({ RUNTIME: runtime }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.actor.sessionId).toBe("session_web_refresh");
      expect(result.rotation?.sealedSession).toBe(rotatedSession);
      expect(result.rotation?.csrfToken).toMatch(/^[A-Za-z0-9_-]+$/u);
    }
  });

  it("clears stale browser cookies when refresh succeeds but admission fails", async () => {
    const { expiredSession } = useRefreshableSession("session_web_refresh_denied");
    const { runtime } = createFakeRuntimeAdmissionBinding();

    const result = await resolveBrowserActor(
      ssrRequest("/whoami", { sessionCookie: expiredSession }),
      createFakeWebEnv({ RUNTIME: runtime }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("not_admitted");
      expect(result.clearSession).toBe(true);
    }
    expect(setResponseHeaderMock).toHaveBeenCalledWith("Set-Cookie", expect.any(Array));
    expect(setResponseHeaderMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("clears stale browser cookies when refresh succeeds but post-refresh assurance fails", async () => {
    const { expiredSession } = useRefreshableSession("session_web_refresh_assurance", {
      authenticationMethod: "MagicAuth",
    });
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });

    const result = await resolveBrowserActor(
      ssrRequest("/whoami", { sessionCookie: expiredSession }),
      createFakeWebEnv({ RUNTIME: runtime }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("insufficient_assurance");
      expect(result.clearSession).toBe(true);
    }
  });

  it("does not clear browser cookies when admission fails without refresh", async () => {
    const { runtime } = createFakeRuntimeAdmissionBinding();
    const result = await resolveBrowserActor(
      sessionRequest(),
      createFakeWebEnv({ RUNTIME: runtime }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.reason).toBe("not_admitted");
      expect(result.clearSession).toBeUndefined();
    }
  });

  it("resolves once per request so a stale cookie is not re-authenticated after refresh", async () => {
    const { expiredSession } = useRefreshableSession("session_web_refresh_memo");
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const request = ssrRequest("/whoami", { sessionCookie: expiredSession });
    const env = createFakeWebEnv({ RUNTIME: runtime });

    const first = await resolveBrowserActor(request, env);
    const second = await resolveBrowserActor(request, env);

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(workosPortMock.createWorkOSSessionPortFromEnv).toHaveBeenCalledTimes(1);
    // The finalize path runs exactly once despite two resolutions (per-request memoization), so its
    // response-header side effects fire once each: the rotation Set-Cookie plus the authed-document
    // Cache-Control/Vary (INS-410). A second call must not re-emit any of them.
    const setCookieCalls = setResponseHeaderMock.mock.calls.filter(
      ([name]) => name === "Set-Cookie",
    );
    const cacheControlCalls = setResponseHeaderMock.mock.calls.filter(
      ([name]) => name === "Cache-Control",
    );
    expect(setCookieCalls).toHaveLength(1);
    expect(cacheControlCalls).toHaveLength(1);
    expect(setResponseHeaderMock).toHaveBeenCalledTimes(3);
  });
});
