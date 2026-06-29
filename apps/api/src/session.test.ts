import {
  generateCsrfToken,
  mintEphemeralSessionCredential,
  testSessionSigningSecret,
} from "@insecur/auth";
import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { createRuntimeRpcStub } from "../test/support/runtime-rpc-stub.js";
import { ADMITTED_USER_ID_RAW, WORKOS_USER_ID } from "../test/support/setup-unit-auth.js";
import app from "./index.js";

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
  RUNTIME: createRuntimeRpcStub(),
  WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
    {
      sessionData: sealedSession,
      userId: workosUserId,
      sessionId: "session_browser",
      authenticationMethod: "Passkey",
    },
  ]),
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

  it("returns auth.invalid when CSRF is missing on cli exchange", async () => {
    const response = await app.request(
      "/v1/auth/cli/exchange",
      {
        method: "POST",
        headers: {
          Cookie: `wos-session=${sealedSession}`,
        },
      },
      env,
    );
    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "auth.invalid" },
    });
  });

  it("rotates the WorkOS session cookie on successful cli exchange", async () => {
    const csrf = generateCsrfToken();
    const response = await app.request(
      "/v1/auth/cli/exchange",
      {
        method: "POST",
        headers: {
          Cookie: `wos-session=${sealedSession}; insecur_csrf=${csrf}`,
          "x-insecur-csrf": csrf,
        },
      },
      env,
    );
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("wos-session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain(`${sealedSession}_rotated`);
  });

  it("returns auth.reauth_required for insufficient-assurance browser sessions", async () => {
    const magicSession = "sealed_magic_auth_worker";
    const magicEnv = {
      ...env,
      WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
        {
          sessionData: magicSession,
          userId: workosUserId,
          sessionId: "session_magic",
          authenticationMethod: "MagicAuth",
          authFactors: [{ type: "totp" }],
        },
      ]),
    };
    const csrf = generateCsrfToken();
    const response = await app.request(
      "/v1/auth/cli/exchange",
      {
        method: "POST",
        headers: {
          Cookie: `wos-session=${magicSession}; insecur_csrf=${csrf}`,
          "x-insecur-csrf": csrf,
        },
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
    expect(text).not.toContain(magicSession);
  });

  it("exchanges a WorkOS browser session for a CLI credential header", async () => {
    const csrf = generateCsrfToken();
    const response = await app.request(
      "/v1/auth/cli/exchange",
      {
        method: "POST",
        headers: {
          Cookie: `wos-session=${sealedSession}; insecur_csrf=${csrf}`,
          "x-insecur-csrf": csrf,
        },
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
});
