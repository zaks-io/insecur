import { authFailureForReason, type AuthFailure } from "./auth-failure.js";
import {
  evaluateSessionAssurance,
  type SessionAssuranceFailureReason,
} from "./session-assurance.js";
import type {
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

function mapAuthenticateFailure(
  result: Extract<WorkOSSessionAuthenticateResult, { authenticated: false }>,
): ResolveWorkOSSessionResult {
  if (result.reason === "missing") {
    return { ok: false, failure: authFailureForReason("missing") };
  }
  if (result.reason === "expired") {
    return { ok: false, failure: authFailureForReason("expired") };
  }
  return { ok: false, failure: authFailureForReason("invalid") };
}

function mapRefreshFailure(result: Extract<WorkOSSessionRefreshResult, { refreshed: false }>): {
  ok: false;
  failure: AuthFailure;
} {
  if (result.reason === "mfa_enrollment") {
    return { ok: false, failure: authFailureForReason("mfa_enrollment") };
  }
  if (result.reason === "missing") {
    return { ok: false, failure: authFailureForReason("missing") };
  }
  if (result.reason === "expired") {
    return { ok: false, failure: authFailureForReason("expired") };
  }
  return { ok: false, failure: authFailureForReason("invalid") };
}

export async function authenticateWorkOSSession(
  workos: WorkOSSessionPort,
  sessionData: string,
): Promise<ResolveWorkOSSessionResult> {
  const workosResult = await workos.authenticateSealedSession(sessionData);
  if (!workosResult.authenticated) {
    return mapAuthenticateFailure(workosResult);
  }
  return evaluateContext(workosResult.context);
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
    const resolved = mapRefreshFailure(refreshResult);
    return { ok: false, failure: resolved.failure };
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
