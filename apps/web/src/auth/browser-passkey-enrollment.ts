import {
  authFailureForReason,
  authenticateWorkOSAuthorizationCode,
  authenticateWorkOSSession,
  hasApprovalPasskey,
  parseRequestCredentials,
  type AuthFailure,
} from "@insecur/auth";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";
import {
  createOAuthState,
  createPkcePair,
  encodePkceRoundTrip,
  formatPkceStateClearCookie,
  formatPkceStateCookie,
  normalizeReturnTo,
  type PkceRoundTrip,
} from "./browser-oauth-pkce.js";
import {
  establishBrowserSessionCookies,
  oauthCallbackUrl,
  oauthRequestMetadata,
  readPkceOAuthCallback,
} from "./browser-oauth-common.js";
import type { WebEnv } from "../env.js";

const DEFAULT_ENROLLMENT_RETURN_TO = "/onboarding";

export interface BrowserPasskeyEnrollmentStart {
  readonly authorizationUrl: string;
  readonly setCookieHeaders: readonly string[];
}

interface BrowserPasskeyEnrollmentCompleteSuccess {
  readonly redirectTo: string;
  readonly setCookieHeaders: readonly string[];
}

export type BrowserPasskeyEnrollmentCompleteResult =
  | { ok: true; value: BrowserPasskeyEnrollmentCompleteSuccess }
  | { ok: false; failure: AuthFailure };

/**
 * Starts WorkOS AuthKit passkey enrollment for a signed-in member. The browser never handles
 * WebAuthn credential material; AuthKit runs the ceremony off-origin (ADR-0052).
 */
export async function beginBrowserPasskeyEnrollment(
  request: Request,
  env: WebEnv,
): Promise<BrowserPasskeyEnrollmentStart | { ok: false; failure: AuthFailure }> {
  const credentials = parseRequestCredentials({
    authorizationHeader: request.headers.get("Authorization"),
    cookieHeader: request.headers.get("Cookie"),
    csrfHeader: request.headers.get("x-insecur-csrf") ?? undefined,
  });
  if (credentials.workosSealedSession === undefined) {
    return { ok: false, failure: authFailureForReason("missing") };
  }

  const workos = createWorkOSSessionPortFromEnv(env);
  const session = await authenticateWorkOSSession(workos, credentials.workosSealedSession);
  if (!session.ok) {
    return { ok: false, failure: session.failure };
  }

  const url = new URL(request.url);
  const pkce = await createPkcePair();
  const state = createOAuthState();
  const returnTo = normalizeReturnTo(
    url.searchParams.get("returnTo"),
    DEFAULT_ENROLLMENT_RETURN_TO,
  );
  const roundTrip: PkceRoundTrip = {
    state,
    codeVerifier: pkce.verifier,
    returnTo,
    workosUserId: session.context.user.id,
    flow: "passkey-enrollment",
  };
  const authorizationUrl = workos.createAuthorizationUrl({
    redirectUri: oauthCallbackUrl(request, "/auth/enroll-passkey/callback"),
    state,
    codeChallenge: pkce.challenge,
    codeChallengeMethod: "S256",
    screenHint: "sign-in",
    ...(session.context.user.email === undefined ? {} : { loginHint: session.context.user.email }),
    maxAge: 0,
  });
  return {
    authorizationUrl,
    setCookieHeaders: [formatPkceStateCookie(encodePkceRoundTrip(roundTrip))],
  };
}

async function exchangeEnrollmentAuthorizationCode(
  env: WebEnv,
  request: Request,
  roundTrip: PkceRoundTrip,
  code: string,
): Promise<BrowserPasskeyEnrollmentCompleteResult> {
  const workos = createWorkOSSessionPortFromEnv(env);
  const exchanged = await authenticateWorkOSAuthorizationCode(workos, {
    code,
    codeVerifier: roundTrip.codeVerifier,
    ...oauthRequestMetadata(request),
  });
  if (!exchanged.ok) {
    return { ok: false, failure: exchanged.failure };
  }

  const { context, sealedSession } = exchanged.session;
  if (roundTrip.workosUserId === undefined || context.user.id !== roundTrip.workosUserId) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }

  const enrolled = hasApprovalPasskey({
    ...(context.authenticationMethod !== undefined
      ? { authenticationMethod: context.authenticationMethod }
      : {}),
  });
  if (!enrolled) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }

  try {
    await workos.recordUserApprovalPasskeyEnrollment(context.user.id);
  } catch {
    return { ok: false, failure: authFailureForReason("invalid") };
  }

  return {
    ok: true,
    value: {
      redirectTo: roundTrip.returnTo,
      setCookieHeaders: [
        ...establishBrowserSessionCookies(sealedSession),
        formatPkceStateClearCookie(),
      ],
    },
  };
}

export async function completeBrowserPasskeyEnrollment(
  request: Request,
  env: WebEnv,
): Promise<BrowserPasskeyEnrollmentCompleteResult> {
  const callback = readPkceOAuthCallback(
    request,
    (roundTrip) => roundTrip.flow === "passkey-enrollment",
  );
  if (callback === null) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }
  return exchangeEnrollmentAuthorizationCode(env, request, callback.roundTrip, callback.code);
}

export function enrollmentFailureRedirectPath(returnTo: string): string {
  const url = new URL(returnTo, "https://insecur.invalid");
  url.searchParams.set("passkey", "failed");
  return `${url.pathname}${url.search}`;
}

/** Redirect target after a failed enrollment callback; honors the PKCE round-trip returnTo. */
export function resolveEnrollmentFailureRedirect(request: Request): string {
  const callback = readPkceOAuthCallback(
    request,
    (roundTrip) => roundTrip.flow === "passkey-enrollment",
  );
  return enrollmentFailureRedirectPath(
    callback?.roundTrip.returnTo ?? DEFAULT_ENROLLMENT_RETURN_TO,
  );
}
