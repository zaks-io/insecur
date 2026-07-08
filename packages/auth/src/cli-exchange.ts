import type { RequestId } from "@insecur/domain";
import type { AdmittedUserResolver } from "./admitted-user.js";
import { authFailureForAdmissionDenial, type AuthFailure } from "./auth-failure.js";
import { mintEphemeralSessionCredential } from "./ephemeral-session.js";
import { authenticateWorkOSAuthorizationCode } from "./resolve-workos-session.js";
import type { InsecurAuthConfig } from "./workos-config.js";
import type { WorkOSSessionPort } from "./workos-session-port.js";
import type { UserActor } from "./user-actor.js";

export interface CliSessionExchangeSuccess {
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly requestId?: RequestId;
}

export type CliSessionExchangeResult =
  | {
      ok: true;
      credential: string;
      body: CliSessionExchangeSuccess;
    }
  | { ok: false; failure: AuthFailure };

export interface CliPkceSessionExchangeInput {
  readonly code: string;
  readonly codeVerifier: string;
  readonly config: InsecurAuthConfig;
  readonly workos: WorkOSSessionPort;
  readonly resolveAdmittedUser: AdmittedUserResolver;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly requestId?: RequestId;
}

interface CliSessionMintInput {
  readonly config: InsecurAuthConfig;
  readonly requestId?: RequestId;
}

async function mintCliExchangeResult(
  input: CliSessionMintInput,
  actor: UserActor,
): Promise<CliSessionExchangeResult> {
  const minted = await mintEphemeralSessionCredential({
    actor,
    signingSecret: input.config.sessionSigningSecret,
  });
  const body: CliSessionExchangeSuccess = {
    sessionId: actor.sessionId,
    expiresAt: minted.expiresAt,
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
  };
  return {
    ok: true,
    credential: minted.credential,
    body,
  };
}

/**
 * Exchanges a WorkOS AuthKit authorization code plus PKCE verifier for a short-lived
 * CLI credential. Native clients use this instead of copying browser session material.
 */
export async function exchangeCliPkceSession(
  input: CliPkceSessionExchangeInput,
): Promise<CliSessionExchangeResult> {
  const authenticated = await authenticateWorkOSAuthorizationCode(input.workos, {
    code: input.code,
    codeVerifier: input.codeVerifier,
    ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
    ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
  });
  if (!authenticated.ok) {
    return { ok: false, failure: authenticated.failure };
  }

  // No session id is passed, so the resolver never checks revocation and "cli_session_revoked" is
  // unreachable here; it is folded into the not-admitted branch defensively to satisfy the union
  // type without an unreachable-code branch (INS-472).
  const admitted = await input.resolveAdmittedUser(authenticated.session.context.user.id);
  if (admitted === null || admitted === "cli_session_revoked") {
    return {
      ok: false,
      failure: authFailureForAdmissionDenial(authenticated.session.context.user.id),
    };
  }

  return mintCliExchangeResult(input, {
    type: "user",
    userId: admitted,
    workosUserId: authenticated.session.context.user.id,
    sessionId: authenticated.session.context.sessionId,
  });
}
