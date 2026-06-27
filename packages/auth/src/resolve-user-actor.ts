import type { AdmittedUserResolver } from "./admitted-user.js";
import {
  authFailureForAdmissionDenial,
  authFailureForReason,
  type AuthFailure,
} from "./auth-failure.js";
import type { ParsedRequestCredentials } from "./credentials.js";
import { verifyEphemeralSessionCredential } from "./ephemeral-session.js";
import type { InsecurAuthConfig } from "./workos-config.js";
import type { UserActor } from "./user-actor.js";

export type ResolveUserActorResult =
  | { ok: true; actor: UserActor }
  | { ok: false; failure: AuthFailure };

export interface ResolveUserActorInput {
  readonly credentials: ParsedRequestCredentials;
  readonly config: InsecurAuthConfig;
  readonly resolveAdmittedUser: AdmittedUserResolver;
}

export async function resolveUserActor(
  input: ResolveUserActorInput,
): Promise<ResolveUserActorResult> {
  const { bearerCredential } = input.credentials;

  if (bearerCredential === undefined) {
    return { ok: false, failure: authFailureForReason("missing") };
  }

  const verified = await verifyEphemeralSessionCredential(
    bearerCredential,
    input.config.sessionSigningSecret,
  );
  if (!verified.ok) {
    const reason = verified.reason === "expired" ? "expired" : "invalid";
    return { ok: false, failure: authFailureForReason(reason) };
  }
  const admitted = await input.resolveAdmittedUser(verified.actor.workosUserId);
  if (admitted === null) {
    return { ok: false, failure: authFailureForAdmissionDenial(verified.actor.workosUserId) };
  }
  if (admitted !== verified.actor.userId) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }

  return { ok: true, actor: verified.actor };
}
