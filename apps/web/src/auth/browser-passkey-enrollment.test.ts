import { describe, expect, it, vi } from "vitest";
import { createFakeWebEnv } from "../../test/support/fake-web-env.js";
import {
  beginBrowserPasskeyEnrollment,
  completeBrowserPasskeyEnrollment,
  enrollmentFailureRedirectPath,
} from "./browser-passkey-enrollment.js";
import { INSECUR_OAUTH_PKCE_COOKIE } from "./browser-oauth-pkce.js";
import { WORKOS_SESSION_COOKIE } from "@insecur/auth";

const pkceLiterals = vi.hoisted(() => ({
  enrollmentCode: "code_passkey_enroll",
  codeVerifier: "verifier_passkey_enroll",
  sealedSession: "sealed-passkey-enroll",
}));
const oauthState = "state_passkey_enroll";

vi.mock("./workos-port.js", async () => {
  const { createFakeWorkOSSessionPort } = await import("@insecur/auth/testing");
  const { fakeSessionEntry } = await import("../../test/support/fake-browser-session.js");
  return {
    createWorkOSSessionPortFromEnv: () =>
      createFakeWorkOSSessionPort([
        fakeSessionEntry({
          sessionData: "sealed-password-session",
          sessionId: "session_password",
          email: "member@example.com",
          authenticationMethod: "Password",
          authFactors: [{ type: "totp" }],
        }),
        fakeSessionEntry({
          sessionData: pkceLiterals.sealedSession,
          sessionId: "session_password",
          userId: "user_01workos",
          authorizationCode: pkceLiterals.enrollmentCode,
          codeVerifier: pkceLiterals.codeVerifier,
          authenticationMethod: "Passkey",
          authFactors: [{ type: "passkey" }],
        }),
        fakeSessionEntry({
          sessionData: "sealed-still-password",
          sessionId: "session_password",
          userId: "user_01workos",
          authorizationCode: "code_no_passkey",
          codeVerifier: "verifier_no_passkey",
          authenticationMethod: "Password",
          authFactors: [{ type: "totp" }],
        }),
      ]),
  };
});

function encodePkceCookie(roundTrip: {
  state: string;
  codeVerifier: string;
  returnTo: string;
  workosUserId?: string;
  flow?: "passkey-enrollment";
}): string {
  return Buffer.from(JSON.stringify(roundTrip), "utf8").toString("base64url");
}

describe("beginBrowserPasskeyEnrollment", () => {
  it("redirects to WorkOS with enrollment PKCE state for a signed-in member", async () => {
    const request = new Request("https://insecur.test/auth/enroll-passkey?returnTo=/onboarding", {
      headers: {
        Cookie: `${WORKOS_SESSION_COOKIE}=sealed-password-session`,
      },
    });

    const started = await beginBrowserPasskeyEnrollment(request, createFakeWebEnv());

    expect("authorizationUrl" in started).toBe(true);
    if ("authorizationUrl" in started) {
      const url = new URL(started.authorizationUrl);
      expect(url.searchParams.get("login_hint")).toBe("member@example.com");
      expect(url.searchParams.get("max_age")).toBe("0");
      expect(started.setCookieHeaders[0]).toContain(INSECUR_OAUTH_PKCE_COOKIE);
    }
  });

  it("rejects unauthenticated enrollment starts", async () => {
    const request = new Request("https://insecur.test/auth/enroll-passkey");
    const started = await beginBrowserPasskeyEnrollment(request, createFakeWebEnv());
    expect(started).toEqual({ ok: false, failure: expect.objectContaining({ reason: "missing" }) });
  });
});

describe("completeBrowserPasskeyEnrollment", () => {
  it("exchanges a valid callback and refreshes the browser session", async () => {
    const roundTrip = {
      state: oauthState,
      codeVerifier: pkceLiterals.codeVerifier,
      returnTo: "/onboarding",
      workosUserId: "user_01workos",
      flow: "passkey-enrollment" as const,
    };
    const request = new Request(
      `https://insecur.test/auth/enroll-passkey/callback?code=${pkceLiterals.enrollmentCode}&state=${oauthState}`,
      {
        headers: {
          Cookie: `${INSECUR_OAUTH_PKCE_COOKIE}=${encodePkceCookie(roundTrip)}`,
        },
      },
    );

    const completed = await completeBrowserPasskeyEnrollment(request, createFakeWebEnv());

    expect(completed.ok).toBe(true);
    if (completed.ok) {
      expect(completed.value.redirectTo).toBe("/onboarding");
      expect(
        completed.value.setCookieHeaders.some((header) => header.includes(WORKOS_SESSION_COOKIE)),
      ).toBe(true);
    }
  });

  it("rejects enrollment callbacks without passkey evidence", async () => {
    const roundTrip = {
      state: oauthState,
      codeVerifier: "verifier_no_passkey",
      returnTo: "/onboarding",
      workosUserId: "user_01workos",
      flow: "passkey-enrollment" as const,
    };
    const request = new Request(
      `https://insecur.test/auth/enroll-passkey/callback?code=code_no_passkey&state=${oauthState}`,
      {
        headers: {
          Cookie: `${INSECUR_OAUTH_PKCE_COOKIE}=${encodePkceCookie(roundTrip)}`,
        },
      },
    );

    const completed = await completeBrowserPasskeyEnrollment(request, createFakeWebEnv());

    expect(completed.ok).toBe(false);
  });
});

describe("enrollmentFailureRedirectPath", () => {
  it("names enrollment failure on the return path", () => {
    expect(enrollmentFailureRedirectPath("/onboarding")).toBe("/onboarding?passkey=failed");
  });
});
