import {
  agentSessionId,
  type AgentSessionId,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import { CLI_SESSION_TTL_SECONDS } from "./constants.js";
import { encodeHmacToken } from "./hmac-token.js";
import type { UserActor } from "./user-actor.js";

const CLI_AGENT_SESSION_TYP = "insecur_cli_agent_session_v1";

export interface MintDerivedAgentSessionInput {
  readonly actor: UserActor;
  readonly signingSecret: string;
  readonly parentExpiresAt: string;
  readonly harnessName?: string;
  readonly credentialScopes?: readonly string[];
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly organizationId?: OrganizationId;
  readonly ttlSeconds?: number;
}

export interface MintDerivedAgentSessionResult {
  readonly credential: string;
  readonly expiresAt: string;
  readonly agentSessionId: AgentSessionId;
}

function parentRemainingTtlSeconds(parentExpiresAt: string, issuedAtEpoch: number): number {
  const parentExpiresAtEpoch = Math.floor(Date.parse(parentExpiresAt) / 1000);
  if (Number.isNaN(parentExpiresAtEpoch)) {
    return CLI_SESSION_TTL_SECONDS;
  }
  return Math.max(0, parentExpiresAtEpoch - issuedAtEpoch);
}

function buildDerivedAgentClaims(
  input: MintDerivedAgentSessionInput,
  derivedAgentSessionId: AgentSessionId,
  issuedAt: number,
  expiresAtEpoch: number,
) {
  const harnessName = input.harnessName?.trim();
  return {
    sub: input.actor.userId,
    wid: input.actor.workosUserId,
    sid: input.actor.sessionId,
    exp: expiresAtEpoch,
    iat: issuedAt,
    typ: CLI_AGENT_SESSION_TYP,
    asid: derivedAgentSessionId,
    ...(input.credentialScopes === undefined ? {} : { scp: [...input.credentialScopes] }),
    ...(input.projectId === undefined ? {} : { prj: input.projectId }),
    ...(input.environmentId === undefined ? {} : { env: input.environmentId }),
    ...(input.organizationId === undefined ? {} : { org: input.organizationId }),
    ...(harnessName === undefined || harnessName === "" ? {} : { hrn: harnessName }),
  };
}

/**
 * Mints a derived agent-marked CLI session credential from a live human session actor.
 * TTL is capped at the parent session expiry (ADR-0032 amendment).
 */
export async function mintDerivedAgentSessionCredential(
  input: MintDerivedAgentSessionInput,
): Promise<MintDerivedAgentSessionResult> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const remainingParentTtl = parentRemainingTtlSeconds(input.parentExpiresAt, issuedAt);
  const requestedTtl = input.ttlSeconds ?? CLI_SESSION_TTL_SECONDS;
  const ttlSeconds = Math.min(CLI_SESSION_TTL_SECONDS, remainingParentTtl, requestedTtl);
  if (ttlSeconds <= 0) {
    throw Object.assign(new Error("Parent session credential expired."), { code: "auth.expired" });
  }
  const expiresAtEpoch = issuedAt + ttlSeconds;
  const derivedAgentSessionId = agentSessionId.generate();
  const payload = buildDerivedAgentClaims(input, derivedAgentSessionId, issuedAt, expiresAtEpoch);
  return {
    credential: await encodeHmacToken(payload, input.signingSecret),
    expiresAt: new Date(expiresAtEpoch * 1000).toISOString(),
    agentSessionId: derivedAgentSessionId,
  };
}
