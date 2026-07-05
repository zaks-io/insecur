import {
  generateCsrfToken,
  INSECUR_CSRF_COOKIE,
  INSECUR_CSRF_HEADER,
  WORKOS_SESSION_COOKIE,
} from "@insecur/auth";
import { createFakeWorkOSSessionPort, testSessionSigningSecret } from "@insecur/auth/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginBrowserLogin,
  completeBrowserLogin,
  logoutBrowserSession,
  redirectResponse,
} from "./browser-oauth.js";
import { formatPkceStateClearCookie, INSECUR_OAUTH_PKCE_COOKIE } from "./browser-oauth-pkce.js";
import type { WebEnv } from "../env.js";

const workosUserId = "user_01workos";
const sealedSession = "sealed-browser-login";
const authorizationCode = "code_browser_login";
const codeVerifier = "verifier_browser_login";
const oauthState = "state_browser_login";

function createTestEnv(): WebEnv {
  return {
    WORKOS_API_KEY: "sk_test",
    WORKOS_CLIENT_ID: "client_test",
    WORKOS_COOKIE_PASSWORD: "cookie-password-at-least-32-characters",
    SESSION_SIGNING_SECRET: testSessionSigningSecret(),
    TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    API: { fetch: () => Promise.reject(new Error("API binding not used")) } as unknown as Fetcher,
    RUNTIME: {
      resolveAdmission: () => Promise.resolve({ ok: true, value: { userId: null } }),
      recordAdmissionDenied: () => Promise.resolve({ ok: true, value: { recorded: true } }),
    },
  };
}

vi.mock("./workos-port.js", () => ({
  createWorkOSSessionPortFromEnv: () =>
    createFakeWorkOSSessionPort([
      {
        sessionData: sealedSession,
        userId: workosUserId,
        sessionId: "session_browser",
        authorizationCode,
        codeVerifier,
        authFactors: [{ type: "totp" }],
      },
    ]),
}));

function encodePkceCookie(roundTrip: {
  state: string;
  codeVerifier: string;
  returnTo: string;
}): string {
  return Buffer.from(JSON.stringify(roundTrip), "utf8").toString("base64url");
}

describe("beginBrowserLogin", () => {
  it("redirects to WorkOS with a PKCE state cookie", async () => {
    const request = new Request("https://insecur.test/login?returnTo=/whoami");
    const started = await beginBrowserLogin(request, createTestEnv());

    const url = new URL(started.authorizationUrl);
    expect(url.origin).toBe("https://workos.test");
    expect(url.searchParams.get("redirect_uri")).toBe("https://insecur.test/auth/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(started.setCookieHeaders).toHaveLength(1);
    expect(started.setCookieHeaders[0]).toContain(`${INSECUR_OAUTH_PKCE_COOKIE}=`);
  });
});

describe("completeBrowserLogin", () => {
  it("exchanges a valid callback for session and CSRF cookies", async () => {
    const roundTrip = {
      state: oauthState,
      codeVerifier,
      returnTo: "/whoami",
    };
    const request = new Request(
      `https://insecur.test/auth/callback?code=${authorizationCode}&state=${oauthState}`,
      {
        headers: {
          Cookie: `${INSECUR_OAUTH_PKCE_COOKIE}=${encodePkceCookie(roundTrip)}`,
        },
      },
    );

    const completed = await completeBrowserLogin(request, createTestEnv());

    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect(completed.value.redirectTo).toBe("/whoami");
      expect(
        completed.value.setCookieHeaders.some((header) => header.includes(WORKOS_SESSION_COOKIE)),
      ).toBe(true);
      expect(
        completed.value.setCookieHeaders.some((header) => header.includes(INSECUR_CSRF_COOKIE)),
      ).toBe(true);
      expect(
        completed.value.setCookieHeaders.some((header) =>
          header.includes(`${INSECUR_OAUTH_PKCE_COOKIE}=`),
        ),
      ).toBe(true);
    }
  });

  it("rejects callbacks with a mismatched OAuth state", async () => {
    const request = new Request(
      `https://insecur.test/auth/callback?code=${authorizationCode}&state=wrong_state`,
      {
        headers: {
          Cookie: `${INSECUR_OAUTH_PKCE_COOKIE}=${encodePkceCookie({
            state: oauthState,
            codeVerifier,
            returnTo: "/whoami",
          })}`,
        },
      },
    );

    const completed = await completeBrowserLogin(request, createTestEnv());

    expect(completed.ok).toBe(false);
    if (!completed.ok) {
      expect(completed.failure.reason).toBe("invalid");
    }
  });
});

describe("logoutBrowserSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears session cookies when the CSRF pair matches", () => {
    const token = generateCsrfToken();
    const request = new Request("https://insecur.test/logout", {
      method: "POST",
      headers: {
        Cookie: `${INSECUR_CSRF_COOKIE}=${token}`,
        [INSECUR_CSRF_HEADER]: token,
      },
    });

    const result = logoutBrowserSession(request);

    expect(result.status).toBe(204);
    expect(result.clearCookieHeaders.some((header) => header.includes(WORKOS_SESSION_COOKIE))).toBe(
      true,
    );
    expect(result.clearCookieHeaders.some((header) => header.includes(INSECUR_CSRF_COOKIE))).toBe(
      true,
    );
  });

  it("rejects logout without a valid CSRF pair", () => {
    const cookieToken = generateCsrfToken();
    const headerToken = generateCsrfToken();
    const request = new Request("https://insecur.test/logout", {
      method: "POST",
      headers: {
        Cookie: `${INSECUR_CSRF_COOKIE}=${cookieToken}`,
        [INSECUR_CSRF_HEADER]: headerToken,
      },
    });

    const result = logoutBrowserSession(request);

    expect(result.status).toBe(403);
    expect(result.clearCookieHeaders).toHaveLength(0);
  });
});

describe("redirectResponse", () => {
  it("can clear the PKCE round-trip cookie on login failure redirects", () => {
    const response = redirectResponse("/login", [formatPkceStateClearCookie()]);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    expect(
      response.headers.getSetCookie().some((header) => header.includes(INSECUR_OAUTH_PKCE_COOKIE)),
    ).toBe(true);
  });
});
