import { SCOPED_ACCESS_TOKEN_TTL_SECONDS } from "./constants.js";
import { isTokenIssuedAtInFuture } from "@insecur/token-signing";
import { decodeHmacToken, encodeHmacToken, type TokenClaims } from "./hmac-token.js";
import { actorFromClaims, readActorClaims } from "./token-actor.js";
import type { UserActor } from "./user-actor.js";
import type {
  EnvironmentId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  RuntimePolicyId,
} from "@insecur/domain";

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
  readonly actor: RuntimeHopActor;
  readonly audience: string;
  readonly signingSecret: string;
  readonly ttlSeconds?: number;
}

export interface RuntimeHopMachineActor {
  readonly type: "machine";
  readonly machineIdentityId: MachineIdentityId;
  readonly tokenScope: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId?: EnvironmentId;
    readonly runtimePolicyKeyId?: RuntimePolicyId;
  };
  readonly credentialScopes: readonly string[];
}

export type RuntimeHopActor = UserActor | RuntimeHopMachineActor;

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
  const actorClaims =
    input.actor.type === "machine"
      ? {
          act: "machine",
          sub: input.actor.machineIdentityId,
          org: input.actor.tokenScope.organizationId,
          prj: input.actor.tokenScope.projectId,
          ...(input.actor.tokenScope.environmentId !== undefined
            ? { env: input.actor.tokenScope.environmentId }
            : {}),
          ...(input.actor.tokenScope.runtimePolicyKeyId !== undefined
            ? { rp: input.actor.tokenScope.runtimePolicyKeyId }
            : {}),
          scp: [...input.actor.credentialScopes],
        }
      : {
          act: "user",
          sub: input.actor.userId,
          wid: input.actor.workosUserId,
          sid: input.actor.sessionId,
        };
  const payload = {
    ...actorClaims,
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
  | { ok: true; actor: RuntimeHopActor }
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
  | { ok: true; actor: RuntimeHopActor; audience: string }
  | { ok: false; reason: "expired" | "invalid" };

function validateLifetime(claims: TokenClaims): "expired" | "invalid" | null {
  if (typeof claims.exp !== "number" || typeof claims.iat !== "number") {
    return "invalid";
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    return "expired";
  }
  return isTokenIssuedAtInFuture(claims.iat, now) ? "invalid" : null;
}

function hasMachineActorCoreClaims(claims: TokenClaims): boolean {
  return (
    claims.act === "machine" &&
    typeof claims.sub === "string" &&
    typeof claims.org === "string" &&
    typeof claims.prj === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function machineActorFromClaims(claims: TokenClaims): RuntimeHopMachineActor | null {
  if (!hasMachineActorCoreClaims(claims) || !isStringArray(claims.scp)) {
    return null;
  }
  return {
    type: "machine",
    machineIdentityId: claims.sub as MachineIdentityId,
    tokenScope: {
      organizationId: claims.org as OrganizationId,
      projectId: claims.prj as ProjectId,
      ...(typeof claims.env === "string" ? { environmentId: claims.env as EnvironmentId } : {}),
      ...(typeof claims.rp === "string"
        ? { runtimePolicyKeyId: claims.rp as RuntimePolicyId }
        : {}),
    },
    credentialScopes: claims.scp,
  };
}

function actorFromScopedClaims(claims: TokenClaims): RuntimeHopActor | null {
  const machineActor = machineActorFromClaims(claims);
  if (machineActor !== null) {
    return machineActor;
  }
  const userClaims = readActorClaims(claims);
  if (userClaims === null) {
    return null;
  }
  const userActor = actorFromClaims(userClaims);
  return userActor.ok ? userActor.actor : null;
}

/** Validates typ/aud/lifetime and returns the actor without checking audience binding. */
export async function readScopedAccessActor(input: {
  readonly token: string;
  readonly signingSecret: string;
}): Promise<ReadScopedAccessActorResult> {
  const decoded = await decodeHmacToken(input.token, input.signingSecret);
  if (decoded === null) {
    return { ok: false, reason: "invalid" };
  }
  const audience = readAudience(decoded);
  if (decoded.typ !== SCOPED_ACCESS_TYP || audience === null) {
    return { ok: false, reason: "invalid" };
  }
  const lifetimeFailure = validateLifetime(decoded);
  if (lifetimeFailure !== null) {
    return { ok: false, reason: lifetimeFailure };
  }
  const actor = actorFromScopedClaims(decoded);
  if (actor === null) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, actor, audience };
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
