import {
  authFailureForReason,
  buildHighAssuranceClearAssuranceFromWorkOSContext,
  type AuthFailure,
  type UserActor,
} from "@insecur/auth";
import { apiClientFor } from "@insecur/worker-kit/api-client";
import { createWorkOSSessionPortFromEnv } from "./workos-port.js";
import { oauthRequestMetadata } from "./browser-oauth-common.js";
import type { PkceRoundTrip } from "./browser-oauth-pkce.js";
import { clearHighAssuranceChallengeForRequest } from "../console/clear-high-assurance-challenge.js";
import {
  stepUpFailureRedirectPath,
  stepUpSuccessRedirectPath,
} from "./browser-challenge-clear-step-up-redirects.js";
import type { WebEnv } from "../env.js";

export type BrowserChallengeClearStepUpCompleteResult =
  | {
      ok: true;
      value: { readonly redirectTo: string; readonly setCookieHeaders: readonly string[] };
    }
  | { ok: false; failure: AuthFailure; redirectTo: string };

interface StepUpExchangeInput {
  readonly env: WebEnv;
  readonly request: Request;
  readonly roundTrip: PkceRoundTrip;
  readonly code: string;
  readonly actor: UserActor;
}

async function verifyStepUpContext(
  input: StepUpExchangeInput,
): Promise<BrowserChallengeClearStepUpCompleteResult | null> {
  const workos = createWorkOSSessionPortFromEnv(input.env);
  const exchanged = await workos.authenticateAuthorizationCode({
    code: input.code,
    codeVerifier: input.roundTrip.codeVerifier,
    ...oauthRequestMetadata(input.request),
  });
  if (!exchanged.authenticated) {
    return {
      ok: false,
      failure: authFailureForReason(exchanged.reason),
      redirectTo: stepUpFailureRedirectPath(input.roundTrip.returnTo, "factor"),
    };
  }

  const { context } = exchanged;
  if (
    context.user.id !== input.roundTrip.workosUserId ||
    context.sessionId !== input.actor.sessionId
  ) {
    return {
      ok: false,
      failure: authFailureForReason("invalid"),
      redirectTo: stepUpFailureRedirectPath(input.roundTrip.returnTo),
    };
  }

  if (buildHighAssuranceClearAssuranceFromWorkOSContext(context) === null) {
    return {
      ok: false,
      failure: authFailureForReason("mfa_enrollment"),
      redirectTo: stepUpFailureRedirectPath(input.roundTrip.returnTo, "unenrolled"),
    };
  }
  return null;
}

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

  const verificationFailure = await verifyStepUpContext(input);
  if (verificationFailure !== null) {
    return verificationFailure;
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
