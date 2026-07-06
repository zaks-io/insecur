import { INSECUR_CSRF_COOKIE, WORKOS_SESSION_COOKIE } from "@insecur/auth";
import { createFakeWorkOSSessionPort } from "@insecur/auth/testing";
import { apiClientFor } from "@insecur/worker-kit/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveBrowserActor } from "../src/auth/resolve-browser-actor.js";
import { loginRedirectHref } from "../src/console/login-redirect.js";
import {
  findConsoleOrganization,
  parseSessionMembershipsBody,
} from "../src/console/organizations.js";
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

// Sample harness test (INS-369): drives the server seam the console SSR routes compose
// (session cookie -> WorkOS port -> Runtime admission -> scoped-token API hop -> guard) with
// fakes only. The same guard over real HTTP against the built worker runs in
// scripts/verify-ssr-csp.mjs (pnpm test:e2e).
const workosPortMock = vi.hoisted(() => ({
  createWorkOSSessionPortFromEnv: vi.fn(),
}));
// Captures the response-header seam `applyBrowserSessionFromResolveResult` writes through, so the
// SSR redirect's session-clear Set-Cookie headers can be asserted without the router internals.
const setResponseHeaderMock = vi.hoisted(() => vi.fn());

vi.mock("../src/auth/workos-port.js", () => workosPortMock);
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: setResponseHeaderMock,
}));

const MEMBER_ORG = {
  organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  displayName: "Acme Corp",
};
const CONSOLE_PATH = `/orgs/${MEMBER_ORG.organizationId}/audit`;

describe("console SSR guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setResponseHeaderMock.mockReset();
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([fakeSessionEntry()]),
    );
  });

  it("sends an unauthenticated console request to /login with the return target", async () => {
    const resolved = await resolveBrowserActor(ssrRequest(CONSOLE_PATH), createFakeWebEnv());

    expect(resolved.ok).toBe(false);
    // Explicit reason: the guard redirects because no session material was presented at all,
    // not because a presented one was rejected.
    if (!resolved.ok) {
      expect(resolved.failure.reason).toBe("missing");
    }
    expect(loginRedirectHref(CONSOLE_PATH)).toBe(
      "/login?returnTo=%2Forgs%2Forg_01JZ8E2QYQAAAAAAAAAAAAAAAA%2Faudit",
    );
  });

  it("redirects an invalid-cookie console request with the session-clear Set-Cookie headers", async () => {
    // Coverage lost when whoami-auth-gate.ts was deleted (INS-412 item 5): a browser session that
    // expired and cannot be refreshed must be cleared on the SSR redirect, not just denied. Drive
    // the exact expired -> refresh-denied path and assert the header seam the redirect merges.
    const expiredSession = "sealed-session-expired-console-clear";
    const rotatedSession = "sealed-session-rotated-console-clear";
    workosPortMock.createWorkOSSessionPortFromEnv.mockImplementation(() =>
      createFakeWorkOSSessionPort([
        fakeSessionEntry({
          sessionData: expiredSession,
          sessionId: "session_console_clear",
          authenticateFailure: "expired",
          rotatedSessionData: rotatedSession,
        }),
        fakeSessionEntry({ sessionData: rotatedSession, sessionId: "session_console_clear" }),
      ]),
    );
    // Refresh succeeds, but admission denies the refreshed subject, so the stale cookies clear.
    const { runtime } = createFakeRuntimeAdmissionBinding();
    const env = createFakeWebEnv({ RUNTIME: runtime });

    const resolved = await resolveBrowserActor(
      ssrRequest(CONSOLE_PATH, { sessionCookie: expiredSession }),
      env,
    );

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.clearSession).toBe(true);
    }
    // The redirect carries the clear Set-Cookie headers for both the WorkOS session and the CSRF
    // cookie via the setResponseHeader seam applyBrowserSessionFromResolveResult writes through.
    expect(setResponseHeaderMock).toHaveBeenCalledWith("Set-Cookie", expect.any(Array));
    const clearHeaders = setResponseHeaderMock.mock.calls
      .filter(([name]) => name === "Set-Cookie")
      .flatMap(([, headers]) => headers as string[]);
    expect(clearHeaders.some((header) => header.includes(`${WORKOS_SESSION_COOKIE}=`))).toBe(true);
    expect(clearHeaders.some((header) => header.includes(`${INSECUR_CSRF_COOKIE}=`))).toBe(true);
    expect(clearHeaders.every((header) => header.includes("Max-Age=0"))).toBe(true);
  });

  it("resolves a fake authed session, reads memberships over the scoped-token hop, and denies non-member orgs", async () => {
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    // The raw success envelope the API edge returns over the private hop. Asserting the no-reveal
    // shape against this fixture (not the parser's output) keeps the assertion non-tautological:
    // the parser can only ever emit the two allowed keys, so checking its output proves nothing.
    const rawMembershipsEnvelope = { ok: true, data: { organizations: [MEMBER_ORG] } } as const;
    const { api, calls } = createFakeApiBinding({
      "/v1/session/memberships": () => Response.json(rawMembershipsEnvelope),
    });
    const env = createFakeWebEnv({ RUNTIME: runtime, API: api });

    const resolved = await resolveBrowserActor(
      ssrRequest(CONSOLE_PATH, { sessionCookie: FAKE_SEALED_SESSION }),
      env,
    );
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }
    expect(resolved.actor.userId).toBe(FAKE_ADMITTED_USER_ID);

    const body = await apiClientFor(env, resolved.actor).sessionMemberships();
    const organizations = parseSessionMembershipsBody(body);
    expect(organizations).toEqual([MEMBER_ORG]);

    // Membership guard: a non-member org id is denied exactly like a nonexistent one.
    expect(findConsoleOrganization(organizations ?? [], MEMBER_ORG.organizationId)).toEqual(
      MEMBER_ORG,
    );
    expect(
      findConsoleOrganization(organizations ?? [], "org_01JZ8E2QYQBBBBBBBBBBBBBBBB"),
    ).toBeUndefined();

    // The private hop carries only the server-minted scoped bearer: no browser cookie crosses it.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("Authorization")).toMatch(/^Bearer /u);
    expect(calls[0]?.headers.get("Cookie")).toBeNull();
    // No-reveal payload shape asserted on the raw wire envelope: each organization entry the edge
    // sends carries exactly the two metadata keys, no secret material riding along.
    expect(rawMembershipsEnvelope.data.organizations.map((org) => Object.keys(org).sort())).toEqual(
      [["displayName", "organizationId"]],
    );
  });
});
