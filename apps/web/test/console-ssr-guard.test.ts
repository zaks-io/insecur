import { apiClientFor } from "@insecur/worker-kit/api-client";
import { describe, expect, it, vi } from "vitest";
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
vi.mock("../src/auth/workos-port.js", async () => {
  const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
  const { fakeSessionEntry } = await import("./support/fake-browser-session.js");
  return {
    createWorkOSSessionPortFromEnv: () => createFakeWorkOSSessionPort([fakeSessionEntry()]),
  };
});
vi.mock("@tanstack/react-start/server", () => ({
  setResponseHeader: () => undefined,
}));

const MEMBER_ORG = {
  organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  displayName: "Acme Corp",
};
const CONSOLE_PATH = `/orgs/${MEMBER_ORG.organizationId}/audit`;

describe("console SSR guard", () => {
  it("sends an unauthenticated console request to /login with the return target", async () => {
    const resolved = await resolveBrowserActor(ssrRequest(CONSOLE_PATH), createFakeWebEnv());

    expect(resolved.ok).toBe(false);
    expect(loginRedirectHref(CONSOLE_PATH)).toBe(
      "/login?returnTo=%2Forgs%2Forg_01JZ8E2QYQAAAAAAAAAAAAAAAA%2Faudit",
    );
  });

  it("resolves a fake authed session, reads memberships over the scoped-token hop, and denies non-member orgs", async () => {
    const { runtime } = createFakeRuntimeAdmissionBinding({
      [FAKE_WORKOS_USER_ID]: FAKE_ADMITTED_USER_ID,
    });
    const { api, calls } = createFakeApiBinding({
      "/v1/session/memberships": () =>
        Response.json({ ok: true, data: { organizations: [MEMBER_ORG] } }),
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

    // The private hop carries only the server-minted scoped bearer: no browser cookie crosses it,
    // and the membership read stays metadata-only (no-reveal payload shape).
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("Authorization")).toMatch(/^Bearer /u);
    expect(calls[0]?.headers.get("Cookie")).toBeNull();
    expect(Object.keys((organizations ?? [])[0] ?? {}).sort()).toEqual([
      "displayName",
      "organizationId",
    ]);
  });
});
