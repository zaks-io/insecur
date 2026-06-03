import type { RequestId } from "@insecur/domain";
import type { AdmittedUserResolver } from "./admitted-user.js";
import { authFailureForReason, type AuthFailure } from "./auth-failure.js";
import { validateCsrfToken } from "./csrf.js";
import type { ParsedRequestCredentials } from "./credentials.js";
import { mintEphemeralSessionCredential } from "./ephemeral-session.js";
import { refreshWorkOSSession } from "./resolve-workos-session.js";
import type { InsecurAuthConfig } from "./workos-config.js";
import type { WorkOSSessionPort } from "./workos-session-port.js";
import type { UserActor } from "./user-actor.js";

export interface CliSessionExchangeSuccess {
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly requestId?: RequestId;
}

export interface CliSessionExchangeRotation {
  readonly sealedSession: string;
}

export type CliSessionExchangeResult =
  | {
      ok: true;
      credential: string;
      body: CliSessionExchangeSuccess;
      rotation?: CliSessionExchangeRotation;
    }
  | { ok: false; failure: AuthFailure };

export interface CliSessionExchangeInput {
  readonly credentials: ParsedRequestCredentials;
  readonly config: InsecurAuthConfig;
  readonly workos: WorkOSSessionPort;
  readonly resolveAdmittedUser: AdmittedUserResolver;
  readonly requestId?: RequestId;
}

async function mintCliExchangeResult(
  input: CliSessionExchangeInput,
  actor: UserActor,
  sealedSession: string,
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
    rotation: { sealedSession },
  };
}

/**
 * Exchanges a valid WorkOS browser session for a memory-only CLI credential.
 * The credential is returned out-of-band via INSECUR_SESSION_CREDENTIAL_HEADER.
 * Browser sessions are rotated via WorkOS refresh before minting the CLI credential.
 */
export async function exchangeCliSession(
  input: CliSessionExchangeInput,
): Promise<CliSessionExchangeResult> {
  const csrfValid = validateCsrfToken(input.credentials.csrfCookie, input.credentials.csrfHeader);
  if (!csrfValid) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }

  if (input.credentials.workosSealedSession === undefined) {
    return { ok: false, failure: authFailureForReason("missing") };
  }

  const rotated = await refreshWorkOSSession(input.workos, input.credentials.workosSealedSession);
  if (!rotated.ok) {
    return rotated;
  }

  const userId = await input.resolveAdmittedUser(rotated.rotated.context.user.id);
  if (userId === null) {
    return { ok: false, failure: authFailureForReason("not_admitted") };
  }

  return mintCliExchangeResult(
    input,
    {
      type: "user",
      userId,
      workosUserId: rotated.rotated.context.user.id,
      sessionId: rotated.rotated.context.sessionId,
    },
    rotated.rotated.sealedSession,
  );
}
