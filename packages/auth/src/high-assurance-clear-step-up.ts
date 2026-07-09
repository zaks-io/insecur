import { authFailureForReason, type AuthFailure } from "./auth-failure.js";
import type {
  EvaluateHighAssuranceChallengeClearInput,
  FreshStepUpFactorType,
} from "./high-assurance-challenge-clear-assurance.js";
import { isHighAssuranceAuthenticationMethod } from "./mfa-posture.js";
import type { UserActor } from "./user-actor.js";
import type { WorkOSSessionContext, WorkOSSessionPort } from "./workos-session-port.js";

export function deriveFreshStepUpFactorFromWorkOSContext(
  context: WorkOSSessionContext,
): FreshStepUpFactorType | null {
  if (isHighAssuranceAuthenticationMethod(context.authenticationMethod)) {
    return "passkey";
  }
  return null;
}

export function buildHighAssuranceClearAssuranceFromWorkOSContext(
  context: WorkOSSessionContext,
): EvaluateHighAssuranceChallengeClearInput | null {
  const freshStepUpFactor = deriveFreshStepUpFactorFromWorkOSContext(context);
  if (freshStepUpFactor === null) {
    return null;
  }
  return {
    authFactors: context.authFactors,
    freshStepUpFactor,
    ...(context.authenticationMethod !== undefined
      ? { authenticationMethod: context.authenticationMethod }
      : {}),
  };
}

export type ResolveHighAssuranceClearAssuranceFromWorkOSStepUpResult =
  | { ok: true; sessionAssurance: EvaluateHighAssuranceChallengeClearInput }
  | { ok: false; failure: AuthFailure };

export interface ResolveHighAssuranceClearAssuranceFromWorkOSStepUpInput {
  readonly workos: WorkOSSessionPort;
  readonly actor: UserActor;
  readonly stepUpCode: string;
  readonly stepUpCodeVerifier: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Binds challenge clear to server-verified WorkOS/AuthKit step-up for the same user and session.
 * Client JSON must not supply step-up factor or authentication method authority (ADR-0032).
 */
export async function resolveHighAssuranceClearAssuranceFromWorkOSStepUp(
  input: ResolveHighAssuranceClearAssuranceFromWorkOSStepUpInput,
): Promise<ResolveHighAssuranceClearAssuranceFromWorkOSStepUpResult> {
  const exchanged = await input.workos.authenticateAuthorizationCode({
    code: input.stepUpCode,
    codeVerifier: input.stepUpCodeVerifier,
    ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
    ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
  });
  if (!exchanged.authenticated) {
    return { ok: false, failure: authFailureForReason(exchanged.reason) };
  }

  const { context } = exchanged;
  if (context.user.id !== input.actor.workosUserId) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }
  if (context.sessionId !== input.actor.sessionId) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }

  const sessionAssurance = buildHighAssuranceClearAssuranceFromWorkOSContext(context);
  if (sessionAssurance === null) {
    return { ok: false, failure: authFailureForReason("mfa_enrollment") };
  }

  return { ok: true, sessionAssurance };
}
