import { CLI_SESSION_TTL_SECONDS } from "./constants.js";
import { decodeHmacToken, encodeHmacToken } from "./hmac-token.js";
import { actorFromClaims, readActorClaims, type ActorClaims } from "./token-actor.js";
import type { UserActor } from "./user-actor.js";

const EPHEMERAL_TYP = "insecur_cli_session_v1";

export interface MintEphemeralSessionInput {
  readonly actor: UserActor;
  readonly signingSecret: string;
  readonly ttlSeconds?: number;
}

export interface MintEphemeralSessionResult {
  readonly credential: string;
  readonly expiresAt: string;
}

export async function mintEphemeralSessionCredential(
  input: MintEphemeralSessionInput,
): Promise<MintEphemeralSessionResult> {
  const ttlSeconds = input.ttlSeconds ?? CLI_SESSION_TTL_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtEpoch = issuedAt + ttlSeconds;
  const payload: ActorClaims = {
    sub: input.actor.userId,
    wid: input.actor.workosUserId,
    sid: input.actor.sessionId,
    exp: expiresAtEpoch,
    iat: issuedAt,
    typ: EPHEMERAL_TYP,
  };
  return {
    credential: await encodeHmacToken(payload, input.signingSecret),
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
  };
}

export type VerifyEphemeralSessionResult =
  { ok: true; actor: UserActor } | { ok: false; reason: "expired" | "invalid" };

export async function verifyEphemeralSessionCredential(
  credential: string,
  signingSecret: string,
): Promise<VerifyEphemeralSessionResult> {
  const decoded = await decodeHmacToken(credential, signingSecret);
  if (decoded === null) {
    return { ok: false, reason: "invalid" };
  }
  const claims = readActorClaims(decoded);
  if (claims?.typ !== EPHEMERAL_TYP) {
    return { ok: false, reason: "invalid" };
  }
  return actorFromClaims(claims);
}
