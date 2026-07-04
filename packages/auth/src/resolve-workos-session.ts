import { authFailureForReason, type AuthFailure } from "./auth-failure.js";
import {
  evaluateSessionAssurance,
  type SessionAssuranceFailureReason,
} from "./session-assurance.js";
import type {
  WorkOSAuthorizationCodeInput,
  WorkOSAuthorizationCodeResult,
  WorkOSSessionAuthenticateResult,
  WorkOSSessionContext,
  WorkOSSessionPort,
  WorkOSSessionRefreshResult,
} from "./workos-session-port.js";

export type ResolveWorkOSSessionResult =
  | { ok: true; context: WorkOSSessionContext }
  | { ok: false; failure: AuthFailure };

function authFailureForAssuranceReason(reason: SessionAssuranceFailureReason): AuthFailure {
  switch (reason) {
    case "sms_not_allowed":
      return authFailureForReason("invalid");
    case "mfa_enrollment":
      return authFailureForReason("mfa_enrollment");
    case "insufficient_assurance":
      return authFailureForReason("insufficient_assurance");
  }
}

function evaluateContext(context: WorkOSSessionContext): ResolveWorkOSSessionResult {
  const assurance = evaluateSessionAssurance({
    authFactors: context.authFactors,
    ...(context.authenticationMethod !== undefined
      ? { authenticationMethod: context.authenticationMethod }
      : {}),
  });
  if (!assurance.ok) {
    return { ok: false, failure: authFailureForAssuranceReason(assurance.reason) };
  }
  return { ok: true, context };
}

type WorkOSSessionFailureReason =
  | Extract<WorkOSSessionAuthenticateResult, { authenticated: false }>["reason"]
  | Extract<WorkOSAuthorizationCodeResult, { authenticated: false }>["reason"]
  | Extract<WorkOSSessionRefreshResult, { refreshed: false }>["reason"];

function mapWorkOSSessionFailure(reason: WorkOSSessionFailureReason): {
  ok: false;
  failure: AuthFailure;
} {
  return { ok: false, failure: authFailureForReason(reason) };
}

function resolveAuthenticatedWorkOSResult(
  result: WorkOSSessionAuthenticateResult | WorkOSAuthorizationCodeResult,
): ResolveWorkOSSessionResult {
  if (!result.authenticated) {
    return mapWorkOSSessionFailure(result.reason);
  }
  return evaluateContext(result.context);
}

export async function authenticateWorkOSSession(
  workos: WorkOSSessionPort,
  sessionData: string,
): Promise<ResolveWorkOSSessionResult> {
  const workosResult = await workos.authenticateSealedSession(sessionData);
  return resolveAuthenticatedWorkOSResult(workosResult);
}

export interface ResolveWorkOSAuthorizationCodeSuccess {
  readonly context: WorkOSSessionContext;
  readonly sealedSession: string;
}

export type ResolveWorkOSAuthorizationCodeResult =
  | { ok: true; session: ResolveWorkOSAuthorizationCodeSuccess }
  | { ok: false; failure: AuthFailure };

function resolveAuthorizationCodeSuccess(
  result: Extract<WorkOSAuthorizationCodeResult, { authenticated: true }>,
): ResolveWorkOSAuthorizationCodeResult {
  const evaluated = evaluateContext(result.context);
  if (!evaluated.ok) {
    return { ok: false, failure: evaluated.failure };
  }
  return {
    ok: true,
    session: {
      context: evaluated.context,
      sealedSession: result.sealedSession,
    },
  };
}

export async function authenticateWorkOSAuthorizationCode(
  workos: WorkOSSessionPort,
  input: WorkOSAuthorizationCodeInput,
): Promise<ResolveWorkOSAuthorizationCodeResult> {
  const workosResult = await workos.authenticateAuthorizationCode(input);
  if (!workosResult.authenticated) {
    return mapWorkOSSessionFailure(workosResult.reason);
  }
  return resolveAuthorizationCodeSuccess(workosResult);
}

export interface RefreshWorkOSSessionSuccess {
  readonly context: WorkOSSessionContext;
  readonly sealedSession: string;
}

export type RefreshWorkOSSessionResult =
  | { ok: true; rotated: RefreshWorkOSSessionSuccess }
  | { ok: false; failure: AuthFailure };

export async function refreshWorkOSSession(
  workos: WorkOSSessionPort,
  sessionData: string,
): Promise<RefreshWorkOSSessionResult> {
  const refreshResult = await workos.refreshSealedSession(sessionData);
  if (!refreshResult.refreshed) {
    return mapWorkOSSessionFailure(refreshResult.reason);
  }
  const evaluated = evaluateContext(refreshResult.context);
  if (!evaluated.ok) {
    return { ok: false, failure: evaluated.failure };
  }
  return {
    ok: true,
    rotated: {
      context: evaluated.context,
      sealedSession: refreshResult.sealedSession,
    },
  };
}
