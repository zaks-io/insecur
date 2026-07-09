import {
  mintDerivedAgentSessionCredential,
  mintEphemeralSessionCredential,
  mintScopedAccessToken,
  type WorkOSSessionPort,
} from "@insecur/auth";
import { INSECUR_API_TOKEN_AUDIENCE, INSECUR_RUNTIME_TOKEN_AUDIENCE } from "@insecur/auth";
import { testSessionSigningSecret, type FakeWorkOSSessionEntry } from "@insecur/auth/testing";
import { userId, agentSessionId } from "@insecur/domain";
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
      const workos = (
        env as {
          readonly WORKOS_TEST_SESSION_PORT?: WorkOSSessionPort;
        }
      ).WORKOS_TEST_SESSION_PORT;
      return actual.createAuthContext(env, {
        ...options,
        ...(workos === undefined
          ? fakeSessions === undefined
            ? {}
            : { workos: createFakeWorkOSSessionPort(fakeSessions) }
          : { workos }),
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

function createSuccessfulPkceExchangeWorkos() {
  const authenticateAuthorizationCode = vi.fn<WorkOSSessionPort["authenticateAuthorizationCode"]>(
    () =>
      Promise.resolve({
        authenticated: true,
        sealedSession: "sealed_metadata_test",
        context: {
          user: { id: workosUserId },
          sessionId: "session_metadata_test",
          authenticationMethod: "Passkey",
          authFactors: [],
        },
      }),
  );
  const workos: WorkOSSessionPort = {
    createAuthorizationUrl: () => {
      throw new Error("createAuthorizationUrl must not run in PKCE exchange metadata test");
    },
    startDeviceAuthorization: () =>
      Promise.reject(
        new Error("startDeviceAuthorization must not run in PKCE exchange metadata test"),
      ),
    authenticateDeviceCode: () =>
      Promise.reject(
        new Error("authenticateDeviceCode must not run in PKCE exchange metadata test"),
      ),
    authenticateAuthorizationCode,
    authenticateSealedSession: () =>
      Promise.reject(
        new Error("authenticateSealedSession must not run in PKCE exchange metadata test"),
      ),
    refreshSealedSession: () =>
      Promise.reject(new Error("refreshSealedSession must not run in PKCE exchange metadata test")),
    listAuthFactors: () => Promise.resolve([]),
    userHasRegisteredPasskey: () => Promise.resolve(false),
    recordUserApprovalPasskeyEnrollment: () => Promise.resolve(),
  };
  return { authenticateAuthorizationCode, workos };
}

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
        sessionValid: true,
        resolvedContext: {},
        attribution: { tier: "none" },
      },
    });
    const data = (body as { data?: { sessionExpiresAt?: string } }).data;
    expect(typeof data?.sessionExpiresAt).toBe("string");
  });

  it("returns whoami for a valid scoped-access bearer credential", async () => {
    const scoped = await mintScopedAccessToken({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_scoped_test",
      },
      audience: INSECUR_API_TOKEN_AUDIENCE,
      signingSecret: env.SESSION_SIGNING_SECRET,
    });
    const response = await app.request(
      "/v1/session/whoami",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${scoped.token}` },
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
        sessionId: "session_scoped_test",
        sessionValid: true,
        attribution: { tier: "none" },
      },
    });
  });

  it("returns auth.insufficient_scope for runtime-audience scoped-access bearer credentials", async () => {
    const scoped = await mintScopedAccessToken({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_runtime_scoped",
      },
      audience: INSECUR_RUNTIME_TOKEN_AUDIENCE,
      signingSecret: env.SESSION_SIGNING_SECRET,
    });
    const response = await app.request(
      "/v1/session/whoami",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${scoped.token}` },
      },
      env,
    );
    expect(response.status).toBe(403);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.insufficient_scope" },
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

  it("no-ops POST /revoke without authentication", async () => {
    const response = await app.request(
      "/v1/session/revoke",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      env,
    );
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: true, data: { revoked: false } });
  });

  it("forwards POST /revoke over the RUNTIME seam for authenticated callers", async () => {
    const runtime = createRuntimeRpcStub();
    runtime.revokeCliSession.mockResolvedValue({ ok: true, value: { revoked: true } });
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_revoke_route",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
    });
    const response = await app.request(
      "/v1/session/revoke",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${minted.credential}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
      { ...env, RUNTIME: runtime },
    );
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: true, data: { revoked: true } });
    expect(runtime.revokeCliSession).toHaveBeenCalledOnce();
    const input = runtime.revokeCliSession.mock.calls[0]?.[0];
    expect(input?.requestId).toEqual(expect.any(String));
    expect(input?.instanceId).toBe("inst_LOCAL_DEV");
    expect(input?.sessionExpiresAt).toBe(minted.expiresAt);
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
    expect(url.searchParams.get("screen_hint")).toBe("sign-in");
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

  it("accepts localhost CLI PKCE redirect URIs", async () => {
    const redirectUri = "http://localhost:49152/callback";
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

  it("rejects missing, blank, and unsupported CLI PKCE authorization inputs", async () => {
    const cases = [
      {
        path: "/v1/auth/cli/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback&code_challenge=challenge_test&code_challenge_method=S256",
        message: "Missing PKCE authorization parameter.",
      },
      {
        path: "/v1/auth/cli/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback&state=state_test&code_challenge=%20%20&code_challenge_method=S256",
        message: "Missing PKCE authorization parameter.",
      },
      {
        path: "/v1/auth/cli/authorize?redirect_uri=http%3A%2F%2F127.0.0.1.evil.example%3A49152%2Fcallback&state=state_test&code_challenge=challenge_test&code_challenge_method=S256",
        message: "CLI redirect URI must be loopback HTTP.",
      },
      {
        path: "/v1/auth/cli/authorize?redirect_uri=https%3A%2F%2F127.0.0.1%3A49152%2Fcallback&state=state_test&code_challenge=challenge_test&code_challenge_method=S256",
        message: "CLI redirect URI must be loopback HTTP.",
      },
      {
        path: "/v1/auth/cli/authorize?redirect_uri=not-a-url&state=state_test&code_challenge=challenge_test&code_challenge_method=S256",
        message: "CLI redirect URI must be loopback HTTP.",
      },
      {
        path: "/v1/auth/cli/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback&state=state_test&code_challenge=challenge_test&code_challenge_method=plain",
        message: "CLI PKCE challenge method must be S256.",
      },
    ];

    for (const testCase of cases) {
      const response = await app.request(testCase.path, { method: "GET" }, env);
      expect(response.status).toBe(400);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: {
          code: "validation.invalid_command_input",
          message: testCase.message,
        },
      });
    }
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

  it("rejects malformed and blank CLI PKCE exchange bodies", async () => {
    const cases = [
      {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        },
        message: "Expected JSON PKCE exchange body.",
      },
      {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(["code_pkce_test", "verifier_pkce_test"]),
        },
        message: "Missing PKCE exchange code or verifier.",
      },
      {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify("code_pkce_test"),
        },
        message: "Expected JSON PKCE exchange body.",
      },
      {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(null),
        },
        message: "Expected JSON PKCE exchange body.",
      },
      {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codeVerifier: "verifier_pkce_test" }),
        },
        message: "Missing PKCE exchange code or verifier.",
      },
      {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: 123, codeVerifier: "verifier_pkce_test" }),
        },
        message: "Missing PKCE exchange code or verifier.",
      },
      {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "code_pkce_test", codeVerifier: 123 }),
        },
        message: "Missing PKCE exchange code or verifier.",
      },
      {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "   ", codeVerifier: "verifier_pkce_test" }),
        },
        message: "Missing PKCE exchange code or verifier.",
      },
      {
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "code_pkce_test", codeVerifier: "\t" }),
        },
        message: "Missing PKCE exchange code or verifier.",
      },
    ];

    for (const testCase of cases) {
      const response = await app.request("/v1/auth/cli/pkce/exchange", testCase.init, env);
      expect(response.status).toBe(400);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        ok: false,
        error: {
          code: "validation.invalid_command_input",
          message: testCase.message,
        },
      });
    }
  });

  it("forwards non-blank CLI PKCE request metadata to WorkOS", async () => {
    const { authenticateAuthorizationCode, workos } = createSuccessfulPkceExchangeWorkos();

    const response = await app.request(
      "/v1/auth/cli/pkce/exchange",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": "203.0.113.42",
          "user-agent": "insecur-cli/1.0",
        },
        body: JSON.stringify({
          code: "code_metadata_test",
          codeVerifier: "verifier_metadata_test",
        }),
      },
      { ...env, WORKOS_TEST_SESSION_PORT: workos },
    );

    expect(response.status).toBe(200);
    expect(authenticateAuthorizationCode).toHaveBeenCalledWith({
      code: "code_metadata_test",
      codeVerifier: "verifier_metadata_test",
      ipAddress: "203.0.113.42",
      userAgent: "insecur-cli/1.0",
    });
  });

  it("omits blank CLI PKCE request metadata from WorkOS", async () => {
    const { authenticateAuthorizationCode, workos } = createSuccessfulPkceExchangeWorkos();

    const response = await app.request(
      "/v1/auth/cli/pkce/exchange",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "cf-connecting-ip": "   ",
          "user-agent": "\t",
        },
        body: JSON.stringify({
          code: "code_metadata_test",
          codeVerifier: "verifier_metadata_test",
        }),
      },
      { ...env, WORKOS_TEST_SESSION_PORT: workos },
    );

    expect(response.status).toBe(200);
    expect(authenticateAuthorizationCode).toHaveBeenCalledWith({
      code: "code_metadata_test",
      codeVerifier: "verifier_metadata_test",
    });
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

  it("derives an agent-marked session from a live human bearer", async () => {
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_cli_derive",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
    });
    const response = await app.request(
      "/v1/session/agent/derive",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${minted.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ harnessName: "agent.harness.claude_code" }),
      },
      env,
    );
    expect(response.status).toBe(200);
    const credential = response.headers.get("x-insecur-session-credential");
    expect(credential).toBeTruthy();
    const body: unknown = await response.json();
    const deriveBody = body as {
      ok: true;
      data: { sessionId: string; agentSessionId: string };
    };
    expect(deriveBody).toMatchObject({
      ok: true,
      data: {
        sessionId: "session_cli_derive",
      },
    });
    const parsedAgentSessionId = agentSessionId.parse(deriveBody.data.agentSessionId);
    if (!parsedAgentSessionId.ok) {
      throw new Error("expected valid agent session id");
    }
    if (credential !== null) {
      const runtime = createRuntimeRpcStub();
      runtime.resolveSessionWhoami.mockResolvedValue({
        ok: true,
        value: {
          sessionValid: true,
          sessionExpiresAt: minted.expiresAt,
          resolvedContext: {},
          attribution: {
            tier: "derived",
            agentSessionId: parsedAgentSessionId.value,
            harnessName: "agent.harness.claude_code",
          },
        },
      });
      const whoami = await app.request(
        "/v1/session/whoami",
        { method: "GET", headers: { Authorization: `Bearer ${credential}` } },
        { ...env, RUNTIME: runtime },
      );
      expect(whoami.status).toBe(200);
      expect(runtime.resolveSessionWhoami).toHaveBeenCalledWith(
        expect.objectContaining({
          agentMarked: true,
          derivedAgentSessionId: parsedAgentSessionId.value,
          harnessName: "agent.harness.claude_code",
        }),
      );
      const whoamiBody: unknown = await whoami.json();
      expect(whoamiBody).toMatchObject({
        ok: true,
        data: {
          attribution: { tier: "derived" },
        },
      });
    }
  });

  it("rejects derive requests with an unknown harnessName", async () => {
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_cli_derive_invalid_harness",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
    });
    const response = await app.request(
      "/v1/session/agent/derive",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${minted.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ harnessName: "agent.harness.anything" }),
      },
      env,
    );
    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "validation.invalid_command_input" },
    });
  });

  it("ignores client harnessName query params for agent-marked whoami", async () => {
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_cli_derive_spoof",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
    });
    const derive = await app.request(
      "/v1/session/agent/derive",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${minted.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ harnessName: "agent.harness.claude_code" }),
      },
      env,
    );
    const agentCredential = derive.headers.get("x-insecur-session-credential");
    expect(agentCredential).toBeTruthy();
    if (agentCredential === null) {
      throw new Error("expected derived agent credential");
    }

    const runtime = createRuntimeRpcStub();
    runtime.resolveSessionWhoami.mockResolvedValue({
      ok: true,
      value: {
        sessionValid: true,
        sessionExpiresAt: minted.expiresAt,
        resolvedContext: {},
        attribution: {
          tier: "derived",
          harnessName: "agent.harness.claude_code",
        },
      },
    });
    const whoami = await app.request(
      "/v1/session/whoami?harnessName=agent.harness.anything",
      { method: "GET", headers: { Authorization: `Bearer ${agentCredential}` } },
      { ...env, RUNTIME: runtime },
    );
    expect(whoami.status).toBe(200);
    expect(runtime.resolveSessionWhoami).toHaveBeenCalledWith(
      expect.objectContaining({
        agentMarked: true,
        harnessName: "agent.harness.claude_code",
      }),
    );
    expect(runtime.resolveSessionWhoami).toHaveBeenCalledWith(
      expect.not.objectContaining({
        harnessName: "agent.harness.anything",
      }),
    );
  });

  it("rejects derive and register from agent-marked sessions", async () => {
    const parentExpiresAt = new Date(Date.now() + 3_600_000).toISOString();
    const derived = await mintDerivedAgentSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_cli_chain_block",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
      parentExpiresAt,
      harnessName: "agent.harness.claude_code",
    });

    const deriveResponse = await app.request(
      "/v1/session/agent/derive",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${derived.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ harnessName: "agent.harness.claude_code" }),
      },
      env,
    );
    expect(deriveResponse.status).toBe(403);
    expect(await deriveResponse.json()).toMatchObject({
      ok: false,
      error: { code: "auth.insufficient_scope" },
    });

    const registerResponse = await app.request(
      "/v1/session/agent/register",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${derived.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          harnessName: "agent.harness.claude_code",
          ancestryKey: "12345",
        }),
      },
      env,
    );
    expect(registerResponse.status).toBe(403);
    expect(await registerResponse.json()).toMatchObject({
      ok: false,
      error: { code: "auth.insufficient_scope" },
    });
  });

  it("registers an agent session over the runtime seam", async () => {
    const minted = await mintEphemeralSessionCredential({
      actor: {
        type: "user",
        userId: admittedUserId,
        workosUserId,
        sessionId: "session_cli_register",
      },
      signingSecret: env.SESSION_SIGNING_SECRET,
    });
    const runtime = createRuntimeRpcStub();
    const registeredId = agentSessionId.generate();
    runtime.registerAgentSession.mockResolvedValue({
      ok: true,
      value: {
        agentSessionId: registeredId,
        harnessName: "agent.harness.claude_code",
      },
    });
    const response = await app.request(
      "/v1/session/agent/register",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${minted.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          harnessName: "agent.harness.claude_code",
          ancestryKey: "12345",
        }),
      },
      { ...env, RUNTIME: runtime },
    );
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: {
        agentSessionId: registeredId,
        harnessName: "agent.harness.claude_code",
      },
    });
    expect(runtime.registerAgentSession).toHaveBeenCalled();
  });
});
