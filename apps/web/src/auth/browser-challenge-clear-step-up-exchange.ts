import { authFailureForReason, type AuthFailure, type UserActor } from "@insecur/auth";
import { apiClientFor } from "@insecur/worker-kit/api-client";
import { clearHighAssuranceChallengeForRequest } from "../console/clear-high-assurance-challenge.js";
import {
  stepUpFailureRedirectPath,
  stepUpSuccessRedirectPath,
} from "./browser-challenge-clear-step-up-redirects.js";
import type { PkceRoundTrip } from "./browser-oauth-pkce.js";
import type { WebEnv } from "../env.js";

export type BrowserChallengeClearStepUpCompleteResult =
  | {
      ok: true;
      value: { readonly redirectTo: string; readonly setCookieHeaders: readonly string[] };
    }
  | { ok: false; failure: AuthFailure; redirectTo: string };

interface StepUpExchangeInput {
  readonly env: WebEnv;
  readonly roundTrip: PkceRoundTrip;
  readonly code: string;
  readonly actor: UserActor;
}

/**
 * Forwards the single-use WorkOS step-up authorization code + PKCE verifier to the API for the one
 * and only exchange. The BFF must not exchange the code here: WorkOS authorization codes are
 * single-use, so a browser-side exchange would consume the code and the API's authoritative step-up
 * verification would then fail against a spent code (INS-517). The API Worker is the sole step-up
 * authority; it re-verifies the same user/session and fresh-factor evidence before clear
 * (ADR-0032), mirroring the Approval Request approve flow. No bearer or credential material is
 * derived or persisted browser-side.
 */
export async function submitChallengeClearAfterStepUp(
  input: StepUpExchangeInput,
): Promise<BrowserChallengeClearStepUpCompleteResult> {
  const challengeClear = input.roundTrip.challengeClear;
  if (challengeClear === undefined) {
    return {
      ok: false,
      failure: authFailureForReason("invalid"),
      redirectTo: stepUpFailureRedirectPath(input.roundTrip.returnTo),
    };
  }

  const api = apiClientFor(input.env, input.actor);
  const outcome = await clearHighAssuranceChallengeForRequest(
    { clearOrgHighAssuranceChallenge: api.clearOrgHighAssuranceChallenge.bind(api) },
    {
      organizationId: challengeClear.organizationId,
      operationId: challengeClear.operationId,
      projectId: challengeClear.projectId,
      ...(challengeClear.environmentId === undefined
        ? {}
        : { environmentId: challengeClear.environmentId }),
      stepUpCode: input.code,
      stepUpCodeVerifier: input.roundTrip.codeVerifier,
    },
  );

  if (!outcome.ok) {
    return {
      ok: false,
      failure: authFailureForReason("invalid"),
      redirectTo: stepUpFailureRedirectPath(input.roundTrip.returnTo, "clear", outcome.code),
    };
  }

  return {
    ok: true,
    value: {
      redirectTo: stepUpSuccessRedirectPath(input.roundTrip.returnTo, outcome),
      setCookieHeaders: [],
    },
  };
}
