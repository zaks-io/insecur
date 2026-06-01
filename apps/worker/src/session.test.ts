import {
  generateCsrfToken,
  mintEphemeralSessionCredential,
  testSessionSigningSecret,
} from "@insecur/auth";
import { userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import app from "./index.js";

const admittedUserId = userId.brand("usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E");
const workosUserId = "user_01workos";
const sealedSession = "sealed_exchange_test";

const env = {
  WORKOS_API_KEY: "sk_test",
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
  SESSION_SIGNING_SECRET: testSessionSigningSecret(),
  ADMITTED_USER_MAP_JSON: JSON.stringify({ [workosUserId]: admittedUserId }),
  WORKOS_FAKE_SESSIONS_JSON: JSON.stringify([
    { sessionData: sealedSession, userId: workosUserId, sessionId: "session_browser" },
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
