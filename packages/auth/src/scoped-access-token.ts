import { SCOPED_ACCESS_TOKEN_TTL_SECONDS } from "./constants.js";
import { decodeHmacToken, encodeHmacToken, type TokenClaims } from "./hmac-token.js";
import { actorFromClaims, readActorClaims } from "./token-actor.js";
import type { UserActor } from "./user-actor.js";

/**
 * Audience-bound short-TTL token the API Worker mints to reach the Runtime Worker over the
 * private Service Binding (ADR-0077). Distinct `typ` and a required `aud` claim keep it from
 * being interchangeable with the CLI ephemeral session credential: the Runtime rejects any
 * token whose audience is not its own deploy audience, so a token minted for one deploy cannot
 * be replayed against another. The coordinate (org/project/env) crosses the seam as explicit RPC
 * arguments, not inside the token; the token only authenticates the forwarded actor.
 */
const SCOPED_ACCESS_TYP = "insecur_scoped_access_v1";

export interface MintScopedAccessTokenInput {
  readonly actor: UserActor;
  readonly audience: string;
  readonly signingSecret: string;
  readonly ttlSeconds?: number;
}

export interface MintScopedAccessTokenResult {
  readonly token: string;
  readonly expiresAt: string;
}

export async function mintScopedAccessToken(
  input: MintScopedAccessTokenInput,
): Promise<MintScopedAccessTokenResult> {
  const ttlSeconds = input.ttlSeconds ?? SCOPED_ACCESS_TOKEN_TTL_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtEpoch = issuedAt + ttlSeconds;
  const payload = {
    sub: input.actor.userId,
    wid: input.actor.workosUserId,
    sid: input.actor.sessionId,
    aud: input.audience,
    exp: expiresAtEpoch,
    iat: issuedAt,
    typ: SCOPED_ACCESS_TYP,
  };
  return {
    token: await encodeHmacToken(payload, input.signingSecret),
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
  };
}

export type VerifyScopedAccessTokenResult =
  | { ok: true; actor: UserActor }
  | { ok: false; reason: "expired" | "audience_mismatch" | "invalid" };

export interface VerifyScopedAccessTokenInput {
  readonly token: string;
  readonly expectedAudience: string;
  readonly signingSecret: string;
}

function readAudience(claims: TokenClaims): string | null {
  return typeof claims.aud === "string" ? claims.aud : null;
}

export type ReadScopedAccessActorResult =
  { ok: true; actor: UserActor; audience: string } | { ok: false; reason: "expired" | "invalid" };

/** Validates typ/aud/lifetime and returns the actor without checking audience binding. */
export async function readScopedAccessActor(input: {
  readonly token: string;
  readonly signingSecret: string;
}): Promise<ReadScopedAccessActorResult> {
  const decoded = await decodeHmacToken(input.token, input.signingSecret);
  if (decoded === null) {
    return { ok: false, reason: "invalid" };
  }
  const claims = readActorClaims(decoded);
  const audience = readAudience(decoded);
  if (claims?.typ !== SCOPED_ACCESS_TYP || audience === null) {
    return { ok: false, reason: "invalid" };
  }
  const actorResult = actorFromClaims(claims);
  if (!actorResult.ok) {
    return actorResult;
  }
  return { ok: true, actor: actorResult.actor, audience };
}

export async function verifyScopedAccessToken(
  input: VerifyScopedAccessTokenInput,
): Promise<VerifyScopedAccessTokenResult> {
  const scoped = await readScopedAccessActor(input);
  if (!scoped.ok) {
    return scoped;
  }
  if (scoped.audience !== input.expectedAudience) {
    return { ok: false, reason: "audience_mismatch" };
  }
  return { ok: true, actor: scoped.actor };
}
