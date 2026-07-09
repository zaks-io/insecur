import { agentSessionId, type AgentSessionId } from "@insecur/domain";
import { CLI_SESSION_TTL_SECONDS } from "./constants.js";
import { decodeHmacToken, encodeHmacToken } from "./hmac-token.js";
import { actorFromClaims, readActorClaims } from "./token-actor.js";
import type { UserActor } from "./user-actor.js";

const EPHEMERAL_TYP = "insecur_cli_session_v1";
const AGENT_EPHEMERAL_TYP = "insecur_cli_agent_session_v1";
const CLI_SESSION_TYPS = new Set([EPHEMERAL_TYP, AGENT_EPHEMERAL_TYP]);

export interface MintEphemeralSessionInput {
  readonly actor: UserActor;
  readonly signingSecret: string;
  readonly ttlSeconds?: number;
  /**
   * When true, the minted credential is agent-marked (device-flow `--agent-session`, ADR-0010).
   * It carries the agent session typ plus a fresh agent session id so whoami reports the
   * derived agent tier, matching the ADR-0032 derived-agent-session semantics.
   */
  readonly agentMarked?: boolean;
}

export interface MintEphemeralSessionResult {
  readonly credential: string;
  readonly expiresAt: string;
  readonly agentSessionId?: AgentSessionId;
}

export async function mintEphemeralSessionCredential(
  input: MintEphemeralSessionInput,
): Promise<MintEphemeralSessionResult> {
  const ttlSeconds = input.ttlSeconds ?? CLI_SESSION_TTL_SECONDS;
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAtEpoch = issuedAt + ttlSeconds;
  const agentSession = input.agentMarked === true ? agentSessionId.generate() : undefined;
  const payload: Record<string, string | number> = {
    sub: input.actor.userId,
    wid: input.actor.workosUserId,
    sid: input.actor.sessionId,
    exp: expiresAtEpoch,
    iat: issuedAt,
    typ: agentSession === undefined ? EPHEMERAL_TYP : AGENT_EPHEMERAL_TYP,
    ...(agentSession === undefined ? {} : { asid: agentSession }),
  };
  return {
    credential: await encodeHmacToken(payload, input.signingSecret),
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
    ...(agentSession === undefined ? {} : { agentSessionId: agentSession }),
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
  if (claims?.typ === undefined || !CLI_SESSION_TYPS.has(claims.typ)) {
    return { ok: false, reason: "invalid" };
  }
  return actorFromClaims(claims);
}
