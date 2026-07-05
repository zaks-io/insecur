import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FAKE_ADMITTED_USER_ID,
  FAKE_SEALED_SESSION,
  FAKE_WORKOS_USER_ID,
  fakeSessionEntry,
} from "./support/fake-browser-session.js";
import {
  createFakeApiBinding,
  createFakeRuntimeAdmissionBinding,
  createFakeWebEnv,
} from "./support/fake-web-env.js";
import { ssrRequest } from "./support/ssr-request.js";

// Every authed console SSR document resolves its API client through resolveAuthenticatedApiClient
// (bff-api.ts). This drives that one chokepoint through the real resolveBrowserActor seam with
// fakes and asserts the no-store cache directive is emitted for an authed actor and withheld for an
// unauthenticated request (INS-410). Because a new authed console route MUST go through this seam to
// read anything over the BFF, a route that renders per-user org metadata without the directive
// cannot exist without breaking this test.
const workosPortMock = vi.hoisted(() => ({ createWorkOSSessionPortFromEnv: vi.fn() }));
const setResponseHeaderMock = vi.hoisted(() => vi.fn());
const getRequestMock = vi.hoisted(() => vi.fn());
const envMock = vi.hoisted(() => ({ current: {} }));

vi.mock("../src/auth/workos-port.js", () => workosPortMock);
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: setResponseHeaderMock,
  getRequest: getRequestMock,
}));
vi.mock("cloudflare:workers", () => ({
  get env() {
    return envMock.current;
  },
}));

const { resolveAuthenticatedApiClient } = await import("../src/server/bff-api.js");

const ORG_PATH = "/orgs/org_01JZ8E2QYQAAAAAAAAAAAAAAAA/audit";

function cacheControlHeaders(): string[] {
  return setResponseHeaderMock.mock.calls
    .filter(([name]) => name === "Cache-Control")
    .map(([, value]) => value as string);
}

describe("resolveAuthenticatedApiClient cache-control emission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits Cache-Control: private, no-store and Vary: Cookie on an authed console document", async () => {
    const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([fakeSessionEntry()]),
    );
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const { api } = createFakeApiBinding();
    envMock.current = createFakeWebEnv({ RUNTIME: runtime, API: api });
    getRequestMock.mockReturnValue(ssrRequest(ORG_PATH, { sessionCookie: FAKE_SEALED_SESSION }));

    const client = await resolveAuthenticatedApiClient();

    expect(client).not.toBeNull();
    expect(setResponseHeaderMock).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(setResponseHeaderMock).toHaveBeenCalledWith("Vary", "Cookie");
  });

  it("never caches an authed document even if a membership read later fails closed", async () => {
    // The directive is bound to actor resolution, not to a successful read: a resolved actor whose
    // downstream metadata read denies still rendered an authed shell, so it must stay uncached.
    const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([fakeSessionEntry()]),
    );
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    envMock.current = createFakeWebEnv({ RUNTIME: runtime, API: createFakeApiBinding().api });
    getRequestMock.mockReturnValue(ssrRequest(ORG_PATH, { sessionCookie: FAKE_SEALED_SESSION }));

    await resolveAuthenticatedApiClient();

    expect(cacheControlHeaders()).toEqual(["private, no-store"]);
  });

  it("does not emit the no-store directive when the session does not resolve", async () => {
    const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([fakeSessionEntry()]),
    );
    envMock.current = createFakeWebEnv();
    // No session cookie: resolveBrowserActor returns not-ok, so no authed document is rendered and
    // the login redirect (browser-oauth.ts) owns its own no-store header instead.
    getRequestMock.mockReturnValue(ssrRequest(ORG_PATH));

    const client = await resolveAuthenticatedApiClient();

    expect(client).toBeNull();
    expect(cacheControlHeaders()).toEqual([]);
  });
});
