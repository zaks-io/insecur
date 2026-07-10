import {
  generateCsrfToken,
  INSECUR_CSRF_COOKIE,
  INSECUR_CSRF_HEADER,
  WORKOS_SESSION_COOKIE,
} from "@insecur/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeWebEnv } from "../../test/support/fake-web-env.js";
import {
  beginBrowserLogin,
  completeBrowserLogin,
  logoutBrowserSession,
  redirectResponse,
} from "./browser-oauth.js";
import { formatPkceStateClearCookie, INSECUR_OAUTH_PKCE_COOKIE } from "./browser-oauth-pkce.js";
import { loginFailureRedirectPath } from "./login-error.js";
import { LOGOUT_CSRF_FIELD } from "./logout-contract.js";

// Single-source the PKCE exchange literals so the fake WorkOS port and the test assertions can
// never silently diverge: the mock factory is hoisted above the imports, so it reads these through
// vi.hoisted rather than re-typing the strings.
const pkceLiterals = vi.hoisted(() => ({
  authorizationCode: "code_browser_login",
  enrollmentBlockedCode: "code_browser_mfa_enrollment",
  codeVerifier: "verifier_browser_login",
}));
const { authorizationCode, enrollmentBlockedCode, codeVerifier } = pkceLiterals;
const oauthState = "state_browser_login";

vi.mock("./workos-port.js", async () => {
  const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
  const { fakeSessionEntry } = await import("../../test/support/fake-browser-session.js");
  return {
    createWorkOSSessionPortFromEnv: () =>
      createFakeWorkOSSessionPort([
        fakeSessionEntry({
          sessionData: "sealed-browser-login",
          sessionId: "session_browser",
          authorizationCode: pkceLiterals.authorizationCode,
          codeVerifier: pkceLiterals.codeVerifier,
        }),
        fakeSessionEntry({
          sessionData: "sealed-browser-enrollment-blocked",
          sessionId: "session_browser_enrollment",
          authorizationCode: pkceLiterals.enrollmentBlockedCode,
          codeVerifier: pkceLiterals.codeVerifier,
          authorizationCodeFailure: "mfa_enrollment",
        }),
      ]),
  };
});

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
    const started = await beginBrowserLogin(request, createFakeWebEnv());

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

    const completed = await completeBrowserLogin(request, createFakeWebEnv());

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

  it("surfaces a session-assurance failure so the callback can name it on /login", async () => {
    // The silent /login loop (INS-421): the code exchange succeeds at WorkOS but the assurance
    // gate rejects the session. The reason must survive to the callback redirect.
    const roundTrip = {
      state: oauthState,
      codeVerifier,
      returnTo: "/whoami",
    };
    const request = new Request(
      `https://insecur.test/auth/callback?code=${enrollmentBlockedCode}&state=${oauthState}`,
      {
        headers: {
          Cookie: `${INSECUR_OAUTH_PKCE_COOKIE}=${encodePkceCookie(roundTrip)}`,
        },
      },
    );

    const completed = await completeBrowserLogin(request, createFakeWebEnv());

    expect(completed.ok).toBe(false);
    if (!completed.ok) {
      expect(completed.failure.reason).toBe("mfa_enrollment");
      expect(loginFailureRedirectPath(completed.failure.reason)).toBe(
        "/login?error=mfa_enrollment",
      );
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

    const completed = await completeBrowserLogin(request, createFakeWebEnv());

    expect(completed.ok).toBe(false);
    if (!completed.ok) {
      expect(completed.failure.reason).toBe("invalid");
      // Non-assurance reasons collapse to the generic code: nothing else leaks into the URL.
      expect(loginFailureRedirectPath(completed.failure.reason)).toBe("/login?error=signin");
    }
  });
});

describe("logoutBrowserSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function expectLocalCookiesCleared(clearCookieHeaders: readonly string[]): void {
    for (const cookie of [WORKOS_SESSION_COOKIE, INSECUR_CSRF_COOKIE, INSECUR_OAUTH_PKCE_COOKIE]) {
      expect(clearCookieHeaders.some((header) => header.includes(`${cookie}=`))).toBe(true);
    }
  }

  it("terminates the WorkOS session via the provider logout URL when the CSRF header matches", async () => {
    const token = generateCsrfToken();
    const request = new Request("https://insecur.test/logout", {
      method: "POST",
      headers: {
        Cookie: `${INSECUR_CSRF_COOKIE}=${token}; ${WORKOS_SESSION_COOKIE}=sealed-browser-login`,
        [INSECUR_CSRF_HEADER]: token,
      },
    });

    const result = await logoutBrowserSession(request, createFakeWebEnv());

    expect(result.ok).toBe(true);
    if (result.ok) {
      const redirect = new URL(result.redirectTo);
      expect(redirect.origin).toBe("https://workos.test");
      expect(redirect.searchParams.get("session_id")).toBe("session_browser");
      expectLocalCookiesCleared(result.clearCookieHeaders);
    }
  });

  it("accepts the CSRF token from the plain-form hidden field", async () => {
    const token = generateCsrfToken();
    const request = new Request("https://insecur.test/logout", {
      method: "POST",
      headers: {
        Cookie: `${INSECUR_CSRF_COOKIE}=${token}; ${WORKOS_SESSION_COOKIE}=sealed-browser-login`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ [LOGOUT_CSRF_FIELD]: token }),
    });

    const result = await logoutBrowserSession(request, createFakeWebEnv());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new URL(result.redirectTo).searchParams.get("session_id")).toBe("session_browser");
      expectLocalCookiesCleared(result.clearCookieHeaders);
    }
  });

  it("falls back to a local /login logout when no sealed session is present", async () => {
    const token = generateCsrfToken();
    const request = new Request("https://insecur.test/logout", {
      method: "POST",
      headers: {
        Cookie: `${INSECUR_CSRF_COOKIE}=${token}`,
        [INSECUR_CSRF_HEADER]: token,
      },
    });

    const result = await logoutBrowserSession(request, createFakeWebEnv());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.redirectTo).toBe("/login");
      expectLocalCookiesCleared(result.clearCookieHeaders);
    }
  });

  it("still clears local cookies when the sealed session no longer resolves at WorkOS", async () => {
    const token = generateCsrfToken();
    const request = new Request("https://insecur.test/logout", {
      method: "POST",
      headers: {
        Cookie: `${INSECUR_CSRF_COOKIE}=${token}; ${WORKOS_SESSION_COOKIE}=sealed-unknown`,
        [INSECUR_CSRF_HEADER]: token,
      },
    });

    const result = await logoutBrowserSession(request, createFakeWebEnv());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.redirectTo).toBe("/login");
      expectLocalCookiesCleared(result.clearCookieHeaders);
    }
  });

  it("rejects logout with a mismatched CSRF pair", async () => {
    const request = new Request("https://insecur.test/logout", {
      method: "POST",
      headers: {
        Cookie: `${INSECUR_CSRF_COOKIE}=${generateCsrfToken()}; ${WORKOS_SESSION_COOKIE}=sealed-browser-login`,
        [INSECUR_CSRF_HEADER]: generateCsrfToken(),
      },
    });

    const result = await logoutBrowserSession(request, createFakeWebEnv());

    expect(result).toEqual({ ok: false, status: 403 });
  });

  it("rejects logout with a mismatched form-field token", async () => {
    const request = new Request("https://insecur.test/logout", {
      method: "POST",
      headers: {
        Cookie: `${INSECUR_CSRF_COOKIE}=${generateCsrfToken()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ [LOGOUT_CSRF_FIELD]: generateCsrfToken() }),
    });

    const result = await logoutBrowserSession(request, createFakeWebEnv());

    expect(result).toEqual({ ok: false, status: 403 });
  });

  it("rejects logout when no CSRF token is presented at all", async () => {
    const request = new Request("https://insecur.test/logout", {
      method: "POST",
      headers: {
        Cookie: `${INSECUR_CSRF_COOKIE}=${generateCsrfToken()}; ${WORKOS_SESSION_COOKIE}=sealed-browser-login`,
      },
    });

    const result = await logoutBrowserSession(request, createFakeWebEnv());

    expect(result).toEqual({ ok: false, status: 403 });
  });
});

describe("redirectResponse", () => {
  it("can clear the PKCE round-trip cookie on login failure redirects", () => {
    const response = redirectResponse(loginFailureRedirectPath("mfa_enrollment"), [
      formatPkceStateClearCookie(),
    ]);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login?error=mfa_enrollment");
    expect(
      response.headers.getSetCookie().some((header) => header.includes(INSECUR_OAUTH_PKCE_COOKIE)),
    ).toBe(true);
  });
});
