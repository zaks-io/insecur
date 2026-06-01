import type { RequestId } from "@insecur/domain";
import type { AdmittedUserResolver } from "./admitted-user.js";
import { authFailureForReason, type AuthFailure } from "./auth-failure.js";
import { validateCsrfToken } from "./csrf.js";
import type { ParsedRequestCredentials } from "./credentials.js";
import { mintEphemeralSessionCredential } from "./ephemeral-session.js";
import type { InsecurAuthConfig } from "./workos-config.js";
import { resolveUserActor } from "./resolve-user-actor.js";
import type { WorkOSSessionPort } from "./workos-session-port.js";

export interface CliSessionExchangeSuccess {
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly requestId?: RequestId;
}

export type CliSessionExchangeResult =
  | { ok: true; credential: string; body: CliSessionExchangeSuccess }
  | { ok: false; failure: AuthFailure };

export interface CliSessionExchangeInput {
  readonly credentials: ParsedRequestCredentials;
  readonly config: InsecurAuthConfig;
  readonly workos: WorkOSSessionPort;
  readonly resolveAdmittedUser: AdmittedUserResolver;
  readonly requireCsrf: boolean;
  readonly requestId?: RequestId;
}

/**
 * Exchanges a valid WorkOS browser session for a memory-only CLI credential.
 * The credential is returned out-of-band via INSECUR_SESSION_CREDENTIAL_HEADER.
 */
export async function exchangeCliSession(
  input: CliSessionExchangeInput,
): Promise<CliSessionExchangeResult> {
  if (input.requireCsrf) {
    const csrfValid = validateCsrfToken(input.credentials.csrfCookie, input.credentials.csrfHeader);
    if (!csrfValid) {
      return { ok: false, failure: authFailureForReason("invalid") };
    }
  }

  if (input.credentials.workosSealedSession === undefined) {
    return { ok: false, failure: authFailureForReason("missing") };
  }

  const resolved = await resolveUserActor({
    credentials: {
      bearerCredential: undefined,
      workosSealedSession: input.credentials.workosSealedSession,
      csrfHeader: input.credentials.csrfHeader,
      csrfCookie: input.credentials.csrfCookie,
    },
    config: input.config,
    workos: input.workos,
    resolveAdmittedUser: input.resolveAdmittedUser,
  });

  if (!resolved.ok) {
    return resolved;
  }

  const minted = await mintEphemeralSessionCredential({
    actor: resolved.actor,
    signingSecret: input.config.sessionSigningSecret,
  });

  const body: CliSessionExchangeSuccess = {
    sessionId: resolved.actor.sessionId,
    expiresAt: minted.expiresAt,
  };
  if (input.requestId !== undefined) {
    return {
      ok: true,
      credential: minted.credential,
      body: { ...body, requestId: input.requestId },
    };
  }
  return { ok: true, credential: minted.credential, body };
}
