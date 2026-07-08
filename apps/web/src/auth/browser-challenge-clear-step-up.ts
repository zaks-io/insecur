import { authFailureForReason, type AuthFailure, type UserActor } from "@insecur/auth";
import { resolveBrowserActor } from "./resolve-browser-actor.js";
import { authenticateBrowserWorkOSSession } from "./browser-workos-session-auth.js";
import {
  createOAuthState,
  createPkcePair,
  encodePkceRoundTrip,
  formatPkceStateClearCookie,
  formatPkceStateCookie,
  normalizeReturnTo,
  type ChallengeClearStepUpContext,
  type PkceRoundTrip,
} from "./browser-oauth-pkce.js";
import { oauthCallbackUrl, readPkceOAuthCallback } from "./browser-oauth-common.js";
import {
  submitChallengeClearAfterStepUp,
  type BrowserChallengeClearStepUpCompleteResult,
} from "./browser-challenge-clear-step-up-exchange.js";
import {
  defaultStepUpReturnTo,
  stepUpFailureRedirectPath,
} from "./browser-challenge-clear-step-up-redirects.js";
import type { WebEnv } from "../env.js";

export { challengeClearStepUpHref } from "./browser-challenge-clear-step-up-public.js";
export {
  stepUpFailureRedirectPath,
  stepUpSuccessRedirectPath,
} from "./browser-challenge-clear-step-up-redirects.js";
export type { BrowserChallengeClearStepUpCompleteResult } from "./browser-challenge-clear-step-up-exchange.js";

export interface BrowserChallengeClearStepUpStart {
  readonly authorizationUrl: string;
  readonly setCookieHeaders: readonly string[];
}

function parseChallengeClearQuery(
  url: URL,
): (ChallengeClearStepUpContext & { returnTo: string }) | null {
  const organizationId = url.searchParams.get("organizationId");
  const operationId = url.searchParams.get("operationId");
  const projectId = url.searchParams.get("projectId");
  const environmentId = url.searchParams.get("environmentId");
  if (organizationId === null || operationId === null || projectId === null) {
    return null;
  }
  if (environmentId !== null && environmentId === "") {
    return null;
  }
  const returnTo = normalizeReturnTo(url.searchParams.get("returnTo"), defaultStepUpReturnTo());
  return {
    organizationId,
    operationId,
    projectId,
    returnTo,
    ...(environmentId === null || environmentId === "" ? {} : { environmentId }),
  };
}

function createChallengeClearRoundTrip(
  challengeContext: ChallengeClearStepUpContext & { returnTo: string },
  workosUserId: string,
  pkce: Awaited<ReturnType<typeof createPkcePair>>,
  state: string,
): PkceRoundTrip {
  return {
    state,
    codeVerifier: pkce.verifier,
    returnTo: challengeContext.returnTo,
    workosUserId,
    flow: "challenge-clear",
    challengeClear: {
      organizationId: challengeContext.organizationId,
      operationId: challengeContext.operationId,
      projectId: challengeContext.projectId,
      ...(challengeContext.environmentId === undefined
        ? {}
        : { environmentId: challengeContext.environmentId }),
    },
  };
}

/** Starts WorkOS AuthKit per-action step-up for challenge clear (ADR-0032, ADR-0052). */
export async function beginBrowserChallengeClearStepUp(
  request: Request,
  env: WebEnv,
): Promise<BrowserChallengeClearStepUpStart | { ok: false; failure: AuthFailure }> {
  const session = await authenticateBrowserWorkOSSession(request, env);
  if (!session.ok) {
    return { ok: false, failure: session.failure };
  }

  const challengeContext = parseChallengeClearQuery(new URL(request.url));
  if (challengeContext === null) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }

  const pkce = await createPkcePair();
  const state = createOAuthState();
  const roundTrip = createChallengeClearRoundTrip(
    challengeContext,
    session.context.user.id,
    pkce,
    state,
  );
  return {
    authorizationUrl: session.workos.createAuthorizationUrl({
      redirectUri: oauthCallbackUrl(request, "/auth/step-up/callback"),
      state,
      codeChallenge: pkce.challenge,
      codeChallengeMethod: "S256",
      screenHint: "sign-in",
      ...(session.context.user.email === undefined
        ? {}
        : { loginHint: session.context.user.email }),
      maxAge: 0,
    }),
    setCookieHeaders: [formatPkceStateCookie(encodePkceRoundTrip(roundTrip))],
  };
}

async function resolveActorForStepUp(
  request: Request,
  env: WebEnv,
  roundTrip: PkceRoundTrip,
): Promise<UserActor | BrowserChallengeClearStepUpCompleteResult> {
  const resolved = await resolveBrowserActor(request, env);
  if (!resolved.ok) {
    return {
      ok: false,
      failure: authFailureForReason("missing"),
      redirectTo: stepUpFailureRedirectPath(roundTrip.returnTo, "session"),
    };
  }
  if (
    roundTrip.workosUserId === undefined ||
    resolved.actor.workosUserId !== roundTrip.workosUserId
  ) {
    return {
      ok: false,
      failure: authFailureForReason("invalid"),
      redirectTo: stepUpFailureRedirectPath(roundTrip.returnTo),
    };
  }
  return resolved.actor;
}

export async function completeBrowserChallengeClearStepUp(
  request: Request,
  env: WebEnv,
): Promise<BrowserChallengeClearStepUpCompleteResult> {
  const callback = readPkceOAuthCallback(
    request,
    (roundTrip) => roundTrip.flow === "challenge-clear",
  );
  if (callback === null) {
    return {
      ok: false,
      failure: authFailureForReason("invalid"),
      redirectTo: stepUpFailureRedirectPath(defaultStepUpReturnTo()),
    };
  }

  const actorResult = await resolveActorForStepUp(request, env, callback.roundTrip);
  if ("ok" in actorResult) {
    return actorResult;
  }

  const completed = await submitChallengeClearAfterStepUp({
    env,
    request,
    roundTrip: callback.roundTrip,
    code: callback.code,
    actor: actorResult,
  });
  if (!completed.ok) {
    return completed;
  }
  return {
    ok: true,
    value: {
      redirectTo: completed.value.redirectTo,
      setCookieHeaders: [formatPkceStateClearCookie(), ...completed.value.setCookieHeaders],
    },
  };
}

export function resolveStepUpFailureRedirect(request: Request): string {
  const callback = readPkceOAuthCallback(
    request,
    (roundTrip) => roundTrip.flow === "challenge-clear",
  );
  return stepUpFailureRedirectPath(callback?.roundTrip.returnTo ?? defaultStepUpReturnTo());
}
