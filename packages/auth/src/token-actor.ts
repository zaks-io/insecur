import { userId } from "@insecur/domain";
import type { TokenClaims } from "./hmac-token.js";
import type { UserActor } from "./user-actor.js";

/** The actor identity and lifetime claims shared by every insecur HMAC token. */
export interface ActorClaims {
  readonly sub: string;
  readonly wid: string;
  readonly sid: string;
  readonly exp: number;
  readonly iat: number;
  readonly typ: string;
}

/** Pull the common actor/lifetime claims off a verified payload, or null if any are missing. */
export function readActorClaims(claims: TokenClaims): ActorClaims | null {
  const { sub, wid, sid, exp, iat, typ } = claims;
  if (
    typeof sub !== "string" ||
    typeof wid !== "string" ||
    typeof sid !== "string" ||
    typeof exp !== "number" ||
    typeof iat !== "number" ||
    typeof typ !== "string"
  ) {
    return null;
  }
  return { sub, wid, sid, exp, iat, typ };
}

export type ActorFromClaimsResult =
  | { ok: true; actor: UserActor }
  | { ok: false; reason: "expired" | "invalid" };

/**
 * Validate the lifetime and rebuild the {@link UserActor} from already typ/aud-checked claims.
 * Callers validate token-kind-specific claims (typ, aud) before calling this.
 */
export function actorFromClaims(claims: ActorClaims): ActorFromClaimsResult {
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    return { ok: false, reason: "expired" };
  }
  const parsedUserId = userId.parse(claims.sub);
  if (!parsedUserId.ok) {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok: true,
    actor: {
      type: "user",
      userId: parsedUserId.value,
      workosUserId: claims.wid,
      sessionId: claims.sid,
    },
  };
}
