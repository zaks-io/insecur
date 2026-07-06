import { mintEphemeralSessionCredential } from "@insecur/auth";
import { testSessionSigningSecret, type FakeWorkOSSessionEntry } from "@insecur/auth/testing";
import { userId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";
import { createRuntimeRpcStub } from "../test/support/runtime-rpc-stub.js";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../test/support/setup-unit-auth.js";
import app from "./index.js";

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

const admittedUserId = userId.brand(ADMITTED_USER_ID_RAW);
const workosUserId = WORKOS_USER_ID;
const sealedSession = "sealed_exchange_test";

// Admission resolution and the denied-admission audit cross the private Runtime Service Binding
// (ADR-0077); these route tests stub it. The default stub admits WORKOS_USER_ID, so authed paths
// resolve to the admitted actor while unknown subjects resolve to null (not admitted).
const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  RUNTIME_TOKEN_SIGNING_SECRET: "runtime-hop-secret-00000000000000000000000000",
  RUNTIME: createRuntimeRpcStub(),
  WORKOS_TEST_FAKE_SESSIONS: [
    {
      sessionData: sealedSession,
      userId: workosUserId,
      sessionId: "session_browser",
      authorizationCode: "code_pkce_test",
      codeVerifier: "verifier_pkce_test",
      authenticationMethod: "Passkey",
    },
  ],
};

describe("worker session routes", () => {
  it("returns auth.required for unauthenticated whoami", async () => {
    const response = await app.request("/v1/session/whoami", { method: "GET" }, env);
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.required" },
    });
  });

  it("returns auth.invalid for malformed bearer credentials", async () => {
    const response = await app.request(
      "/v1/session/whoami",
      { method: "GET", headers: { Authorization: "Bearer not-a-valid-credential" } },
      env,
    );
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.invalid" },
    });
  });

  it("returns auth.invalid for three-part bearer with invalid base64 signature", async () => {
    const response = await app.request(
      "/v1/session/whoami",
      { method: "GET", headers: { Authorization: "Bearer a.b.!" } },
      env,
    );
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.invalid" },
    });
  });

  it("returns auth.expired for expired bearer credentials", async () => {
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_cli_expired",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
      ttlSeconds: -5,
    });
    const response = await app.request(
      "/v1/session/whoami",
      { method: "GET", headers: { Authorization: `Bearer ${minted.credential}` } },
      env,
    );
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.expired" },
    });
  });

  it("returns whoami for a valid bearer credential", async () => {
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_cli_test",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
    });
    const response = await app.request(
      "/v1/session/whoami",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${minted.credential}` },
      },
      env,
    );
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: {
        actorType: "user",
        userId: admittedUserId,
        sessionId: "session_cli_test",
      },
    });
  });

  it("returns auth.required for unauthenticated session memberships", async () => {
    const response = await app.request("/v1/session/memberships", { method: "GET" }, env);
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.required" },
    });
  });

  it("forwards the memberships read over the RUNTIME seam and returns the organizations", async () => {
    const runtime = createRuntimeRpcStub();
    runtime.listSessionOrganizations.mockResolvedValue({
      ok: true,
      value: {
        organizations: [
          { organizationId: "org_00000000000000000000000001", displayName: "Acme Corp" },
        ] as never,
      },
    });
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_memberships_test",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
    });

    const response = await app.request(
      "/v1/session/memberships",
      { method: "GET", headers: { Authorization: `Bearer ${minted.credential}` } },
      { ...env, RUNTIME: runtime },
    );

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: {
        organizations: [
          { organizationId: "org_00000000000000000000000001", displayName: "Acme Corp" },
        ],
      },
    });
    const input = runtime.listSessionOrganizations.mock.calls[0]?.[0];
    expect(input?.actorToken).toEqual(expect.any(String));
    expect(input?.requestId).toEqual(expect.any(String));
  });

  it("redirects CLI PKCE authorization requests to WorkOS AuthKit", async () => {
    const response = await app.request(
      "/v1/auth/cli/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback&state=state_test&code_challenge=challenge_test&code_challenge_method=S256",
      { method: "GET" },
      env,
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toContain("https://workos.test/authorize?");
    const url = new URL(location ?? "");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:49152/callback");
    expect(url.searchParams.get("state")).toBe("state_test");
    expect(url.searchParams.get("code_challenge")).toBe("challenge_test");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("accepts IPv6 loopback CLI PKCE redirect URIs", async () => {
    const redirectUri = "http://[::1]:49152/callback";
    const response = await app.request(
      `/v1/auth/cli/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=state_test&code_challenge=challenge_test&code_challenge_method=S256`,
      { method: "GET" },
      env,
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    const url = new URL(location ?? "");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
  });

  it("rejects non-loopback CLI PKCE redirect URIs", async () => {
    const response = await app.request(
      "/v1/auth/cli/authorize?redirect_uri=https%3A%2F%2Fevil.example%2Fcallback&state=state_test&code_challenge=challenge_test&code_challenge_method=S256",
      { method: "GET" },
      env,
    );
    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "validation.invalid_command_input" },
    });
  });

  it("exchanges a WorkOS PKCE code for a CLI credential header", async () => {
    const response = await app.request(
      "/v1/auth/cli/pkce/exchange",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "code_pkce_test",
          codeVerifier: "verifier_pkce_test",
        }),
      },
      env,
    );
    expect(response.status).toBe(200);
    const credential = response.headers.get("x-insecur-session-credential");
    expect(credential).toBeTruthy();
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { sessionId: "session_browser" },
    });
    if (credential !== null) {
      const whoami = await app.request(
        "/v1/session/whoami",
        { method: "GET", headers: { Authorization: `Bearer ${credential}` } },
        env,
      );
      expect(whoami.status).toBe(200);
    }
  });

  it("returns auth.reauth_required for insufficient-assurance PKCE sessions", async () => {
    const magicEnv = {
      ...env,
      WORKOS_TEST_FAKE_SESSIONS: [
        {
          sessionData: "sealed_unused_magic",
          userId: workosUserId,
          sessionId: "session_magic",
          authorizationCode: "code_magic",
          codeVerifier: "verifier_magic",
          authenticationMethod: "MagicAuth",
          authFactors: [{ type: "totp" }],
        },
      ],
    };
    const response = await app.request(
      "/v1/auth/cli/pkce/exchange",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "code_magic",
          codeVerifier: "verifier_magic",
        }),
      },
      magicEnv,
    );
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.reauth_required" },
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain("code_magic");
    expect(text).not.toContain("verifier_magic");
  });
});
