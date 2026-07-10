import { environmentId, organizationId, projectId, userId } from "@insecur/domain";
import { isTokenIssuedAtInFuture } from "@insecur/token-signing";
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
  readonly scp?: readonly string[];
  readonly org?: string;
  readonly prj?: string;
  readonly env?: string;
}

function hasActorCoreClaims(claims: TokenClaims): boolean {
  return (
    typeof claims.sub === "string" &&
    typeof claims.wid === "string" &&
    typeof claims.sid === "string" &&
    typeof claims.exp === "number" &&
    typeof claims.iat === "number" &&
    typeof claims.typ === "string"
  );
}

function isOptionalStringArray(value: unknown): boolean {
  return (
    value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function areOptionalStrings(values: readonly unknown[]): boolean {
  return values.every((value) => value === undefined || typeof value === "string");
}

/** Pull the common actor/lifetime claims off a verified payload, or null if any are missing. */
export function readActorClaims(claims: TokenClaims): ActorClaims | null {
  const { sub, wid, sid, exp, iat, typ, scp, org, prj, env } = claims;
  if (!hasActorCoreClaims(claims)) {
    return null;
  }
  if (!isOptionalStringArray(scp)) {
    return null;
  }
  if (!areOptionalStrings([org, prj, env])) {
    return null;
  }
  return {
    sub: sub as string,
    wid: wid as string,
    sid: sid as string,
    exp: exp as number,
    iat: iat as number,
    typ: typ as string,
    ...(scp === undefined ? {} : { scp: scp as string[] }),
    ...(typeof org === "string" ? { org } : {}),
    ...(typeof prj === "string" ? { prj } : {}),
    ...(typeof env === "string" ? { env } : {}),
  };
}

export type ActorFromClaimsResult =
  { ok: true; actor: UserActor } | { ok: false; reason: "expired" | "invalid" };

function parseOptionalId<T>(
  raw: string | undefined,
  parse: (value: string) => { ok: true; value: T } | { ok: false },
): T | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = parse(raw);
  return parsed.ok ? parsed.value : null;
}

function hasTokenScopeClaims(claims: ActorClaims): boolean {
  return [claims.org, claims.prj, claims.env].some((value) => value !== undefined);
}

function parseTokenScope(claims: ActorClaims): UserActor["tokenScope"] | null | undefined {
  if (!hasTokenScopeClaims(claims)) {
    return undefined;
  }
  const organizationIdValue = parseOptionalId(claims.org, (raw) => organizationId.parse(raw));
  const projectIdValue = parseOptionalId(claims.prj, (raw) => projectId.parse(raw));
  const environmentIdValue = parseOptionalId(claims.env, (raw) => environmentId.parse(raw));
  if (organizationIdValue === null || projectIdValue === null || environmentIdValue === null) {
    return null;
  }
  return {
    ...(organizationIdValue === undefined ? {} : { organizationId: organizationIdValue }),
    ...(projectIdValue === undefined ? {} : { projectId: projectIdValue }),
    ...(environmentIdValue === undefined ? {} : { environmentId: environmentIdValue }),
  };
}

/**
 * Validate the lifetime and rebuild the {@link UserActor} from already typ/aud-checked claims.
 * Callers validate token-kind-specific claims (typ, aud) before calling this.
 */
export function actorFromClaims(claims: ActorClaims): ActorFromClaimsResult {
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    return { ok: false, reason: "expired" };
  }
  if (isTokenIssuedAtInFuture(claims.iat, now)) {
    return { ok: false, reason: "invalid" };
  }
  const parsedUserId = userId.parse(claims.sub);
  if (!parsedUserId.ok) {
    return { ok: false, reason: "invalid" };
  }
  const tokenScope = parseTokenScope(claims);
  if (tokenScope === null) {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok: true,
    actor: {
      type: "user",
      userId: parsedUserId.value,
      workosUserId: claims.wid,
      sessionId: claims.sid,
      ...(claims.scp === undefined ? {} : { credentialScopes: claims.scp }),
      ...(tokenScope === undefined ? {} : { tokenScope }),
    },
  };
}
