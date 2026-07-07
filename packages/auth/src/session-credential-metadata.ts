import { agentSessionId, type AgentSessionId } from "@insecur/domain";
import { decodeHmacToken } from "./hmac-token.js";
import { readActorClaims } from "./token-actor.js";

const CLI_SESSION_TYP = "insecur_cli_session_v1";
const CLI_AGENT_SESSION_TYP = "insecur_cli_agent_session_v1";

export interface SessionCredentialMetadata {
  readonly expiresAt: string;
  readonly sessionValid: true;
  readonly derivedAgentSessionId?: AgentSessionId;
  readonly agentMarked: boolean;
}

function readAgentMarkedClaim(claims: Record<string, unknown>, typ: string): boolean {
  if (typ === CLI_AGENT_SESSION_TYP) {
    return true;
  }
  const agm = claims.agm;
  return agm === 1 || agm === "1" || agm === true;
}

function readDerivedAgentSessionId(claims: Record<string, unknown>): AgentSessionId | undefined {
  const asid = claims.asid;
  if (typeof asid !== "string") {
    return undefined;
  }
  const parsed = agentSessionId.parse(asid);
  return parsed.ok ? parsed.value : undefined;
}

/**
 * Reads session lifetime and agent-attribution claims from a verified CLI session credential.
 * Call after auth has accepted the bearer; invalid tokens throw.
 */
export async function readSessionCredentialMetadata(
  bearerCredential: string,
  signingSecret: string,
): Promise<SessionCredentialMetadata> {
  const decoded = await decodeHmacToken(bearerCredential, signingSecret);
  if (decoded === null) {
    throw Object.assign(new Error("Invalid session credential."), { code: "auth.invalid" });
  }

  const claims = readActorClaims(decoded);
  if (claims === null || (claims.typ !== CLI_SESSION_TYP && claims.typ !== CLI_AGENT_SESSION_TYP)) {
    throw Object.assign(new Error("Invalid session credential."), { code: "auth.invalid" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    throw Object.assign(new Error("Session credential expired."), { code: "auth.expired" });
  }

  const agentMarked = readAgentMarkedClaim(decoded, claims.typ);
  const derivedAgentSessionId = readDerivedAgentSessionId(decoded);

  return {
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    sessionValid: true,
    agentMarked,
    ...(derivedAgentSessionId !== undefined ? { derivedAgentSessionId } : {}),
  };
}
