import type { AdmittedUserResolver } from "./admitted-user.js";
import {
  authFailureForAdmissionDenial,
  authFailureForReason,
  type AuthFailure,
} from "./auth-failure.js";
import { INSECUR_API_TOKEN_AUDIENCE } from "./constants.js";
import type { ParsedRequestCredentials } from "./credentials.js";
import { verifyEphemeralSessionCredential } from "./ephemeral-session.js";
import { readScopedAccessActor, verifyScopedAccessToken } from "./scoped-access-token.js";
import type { InsecurAuthConfig } from "./workos-config.js";
import type { UserActor } from "./user-actor.js";

export type ResolveUserActorResult =
  { ok: true; actor: UserActor } | { ok: false; failure: AuthFailure };

export interface ResolveUserActorInput {
  readonly credentials: ParsedRequestCredentials;
  readonly config: InsecurAuthConfig;
  readonly resolveAdmittedUser: AdmittedUserResolver;
  /**
   * When true, accepts scoped-access tokens minted for non-API audiences so route handlers
   * can reject them with auth.insufficient_scope instead of auth.invalid.
   */
  readonly acceptAnyScopedAccessAudience?: boolean;
}

async function resolveAdmittedActor(
  actor: UserActor,
  resolveAdmittedUser: AdmittedUserResolver,
): Promise<ResolveUserActorResult> {
  const admitted = await resolveAdmittedUser(actor.workosUserId);
  if (admitted === null) {
    return { ok: false, failure: authFailureForAdmissionDenial(actor.workosUserId) };
  }
  if (admitted !== actor.userId) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }
  return { ok: true, actor };
}

async function resolveUserActorFromScopedBearer(
  bearerCredential: string,
  input: ResolveUserActorInput,
): Promise<ResolveUserActorResult | null> {
  const scoped = await verifyScopedAccessToken({
    token: bearerCredential,
    expectedAudience: INSECUR_API_TOKEN_AUDIENCE,
    signingSecret: input.config.sessionSigningSecret,
  });
  if (scoped.ok) {
    return resolveAdmittedActor(scoped.actor, input.resolveAdmittedUser);
  }
  if (scoped.reason === "expired") {
    return { ok: false, failure: authFailureForReason("expired") };
  }
  if (input.acceptAnyScopedAccessAudience !== true || scoped.reason !== "audience_mismatch") {
    return null;
  }

  const anyAudience = await readScopedAccessActor({
    token: bearerCredential,
    signingSecret: input.config.sessionSigningSecret,
  });
  if (anyAudience.ok) {
    return resolveAdmittedActor(anyAudience.actor, input.resolveAdmittedUser);
  }
  if (anyAudience.reason === "expired") {
    return { ok: false, failure: authFailureForReason("expired") };
  }
  return null;
}

async function resolveUserActorFromEphemeralBearer(
  bearerCredential: string,
  input: ResolveUserActorInput,
): Promise<ResolveUserActorResult> {
  const verified = await verifyEphemeralSessionCredential(
    bearerCredential,
    input.config.sessionSigningSecret,
  );
  if (!verified.ok) {
    const reason = verified.reason === "expired" ? "expired" : "invalid";
    return { ok: false, failure: authFailureForReason(reason) };
  }
  return resolveAdmittedActor(verified.actor, input.resolveAdmittedUser);
}

export async function resolveUserActor(
  input: ResolveUserActorInput,
): Promise<ResolveUserActorResult> {
  const { bearerCredential } = input.credentials;

  if (bearerCredential === undefined) {
    return { ok: false, failure: authFailureForReason("missing") };
  }

  const scopedResult = await resolveUserActorFromScopedBearer(bearerCredential, input);
  if (scopedResult !== null) {
    return scopedResult;
  }

  return resolveUserActorFromEphemeralBearer(bearerCredential, input);
}
