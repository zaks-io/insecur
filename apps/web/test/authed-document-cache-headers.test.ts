import { createFakeWorkOSSessionPort } from "@insecur/auth/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import {
  FAKE_ADMITTED_USER_ID,
  FAKE_SEALED_SESSION,
  FAKE_WORKOS_USER_ID,
  fakeSessionEntry,
} from "./support/fake-browser-session.js";
import { createFakeRuntimeAdmissionBinding, createFakeWebEnv } from "./support/fake-web-env.js";
import { ssrRequest } from "./support/ssr-request.js";

// INS-410: the no-store cache directive for authed console SSR documents is stamped in
// resolveBrowserActor's finalize path (session-headers.applyBrowserSessionFromResolveResult), so
// ANY successful actor resolution carries it, not just reads that go through the BFF client
// chokepoint. Driving resolveBrowserActor directly here means a new authed loader that resolves the
// session by any route (BFF client, a raw session primitive, a future helper) still gets the header
// as long as it produces an authed actor — the structural invariant this test locks. The negative
// cases prove the header is withheld on the unauthenticated and INS-412 fail-closed paths, which
// render a redirect/login that owns its own no-store.
const workosPortMock = vi.hoisted(() => ({ createWorkOSSessionPortFromEnv: vi.fn() }));
const setResponseHeaderMock = vi.hoisted(() => vi.fn());

vi.mock("../src/auth/workos-port.js", () => workosPortMock);
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: setResponseHeaderMock,
}));

const ORG_PATH = "/orgs/org_01JZ8E2QYQAAAAAAAAAAAAAAAA/audit";

function headerValues(name: string): string[] {
  return setResponseHeaderMock.mock.calls
    .filter(([header]) => header === name)
    .map(([, value]) => value as string);
}

describe("authed-document cache headers (resolveBrowserActor finalize path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([fakeSessionEntry()]),
    );
  });

  it("stamps Cache-Control: private, no-store and Vary: Cookie on a successful actor resolution", async () => {
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const env = createFakeWebEnv({ RUNTIME: runtime });

    const resolved = await resolveBrowserActor(
      ssrRequest(ORG_PATH, { sessionCookie: FAKE_SEALED_SESSION }),
      env,
    );

    expect(resolved.ok).toBe(true);
    expect(headerValues("Cache-Control")).toEqual(["private, no-store"]);
    expect(headerValues("Vary")).toEqual(["Cookie"]);
  });

  it("does not stamp the no-store directive when no session material is presented", async () => {
    // Unauthenticated: resolveBrowserActor returns not-ok, no authed document renders, and the
    // console guard's /login redirect (browser-oauth.ts) owns its own no-store instead.
    const resolved = await resolveBrowserActor(ssrRequest(ORG_PATH), createFakeWebEnv());

    expect(resolved.ok).toBe(false);
    expect(headerValues("Cache-Control")).toEqual([]);
    expect(headerValues("Vary")).toEqual([]);
  });

  it("does not stamp the no-store directive on the INS-412 fail-closed clear-session path", async () => {
    // Session expired, refresh succeeds, but admission denies the refreshed subject: the result is
    // not-ok with clearSession, so the SSR redirect clears the cookies. That redirect is not an
    // authed document, so it must not receive the authed cache directive (only its clear cookies).
    const expiredSession = "sealed-session-expired-cache-header";
    const rotatedSession = "sealed-session-rotated-cache-header";
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([
        fakeSessionEntry({
          sessionData: expiredSession,
          sessionId: "session_cache_header",
          authenticateFailure: "expired",
          rotatedSessionData: rotatedSession,
        }),
        fakeSessionEntry({ sessionData: rotatedSession, sessionId: "session_cache_header" }),
      ]),
    );
    const { runtime } = createFakeRuntimeAdmissionBinding();
    const env = createFakeWebEnv({ RUNTIME: runtime });

    const resolved = await resolveBrowserActor(
      ssrRequest(ORG_PATH, { sessionCookie: expiredSession }),
      env,
    );

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.clearSession).toBe(true);
    }
    expect(headerValues("Cache-Control")).toEqual([]);
    expect(headerValues("Vary")).toEqual([]);
    // The clear-session cookies still go out; only the authed cache directive is withheld.
    expect(setResponseHeaderMock).toHaveBeenCalledWith("Set-Cookie", expect.any(Array));
  });
});
