import { agentSessionId, type AgentSessionId } from "@insecur/domain";
import { INSECUR_API_TOKEN_AUDIENCE } from "./constants.js";
import { decodeHmacToken } from "./hmac-token.js";
import { readActorClaims } from "./token-actor.js";

const CLI_SESSION_TYP = "insecur_cli_session_v1";
const CLI_AGENT_SESSION_TYP = "insecur_cli_agent_session_v1";
const SCOPED_ACCESS_TYP = "insecur_scoped_access_v1";

export interface SessionCredentialMetadata {
  readonly expiresAt: string;
  readonly sessionValid: true;
  readonly derivedAgentSessionId?: AgentSessionId;
  readonly agentMarked: boolean;
  readonly harnessName?: string;
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

function readHarnessNameClaim(claims: Record<string, unknown>): string | undefined {
  const hrn = claims.hrn;
  if (typeof hrn !== "string") {
    return undefined;
  }
  const trimmed = hrn.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readScopedAccessAudience(claims: Record<string, unknown>): string | null {
  const aud = claims.aud;
  return typeof aud === "string" ? aud : null;
}

function readCliSessionCredentialMetadata(
  decoded: Record<string, unknown>,
  claims: NonNullable<ReturnType<typeof readActorClaims>>,
): SessionCredentialMetadata {
  const agentMarked = readAgentMarkedClaim(decoded, claims.typ);
  const derivedAgentSessionId = readDerivedAgentSessionId(decoded);
  const harnessName = readHarnessNameClaim(decoded);

  return {
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    sessionValid: true,
    agentMarked,
    ...(derivedAgentSessionId !== undefined ? { derivedAgentSessionId } : {}),
    ...(harnessName !== undefined ? { harnessName } : {}),
  };
}

function readScopedAccessCredentialMetadata(
  claims: NonNullable<ReturnType<typeof readActorClaims>>,
  audience: string,
): SessionCredentialMetadata {
  if (audience !== INSECUR_API_TOKEN_AUDIENCE) {
    throw Object.assign(new Error("Scoped access token is not valid for this route."), {
      code: "auth.insufficient_scope",
    });
  }

  return {
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    sessionValid: true,
    agentMarked: false,
  };
}

function assertCredentialNotExpired(claims: NonNullable<ReturnType<typeof readActorClaims>>): void {
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    throw Object.assign(new Error("Session credential expired."), { code: "auth.expired" });
  }
}

function readVerifiedCredentialMetadata(
  decoded: Record<string, unknown>,
  claims: NonNullable<ReturnType<typeof readActorClaims>>,
): SessionCredentialMetadata {
  if (claims.typ === CLI_SESSION_TYP || claims.typ === CLI_AGENT_SESSION_TYP) {
    return readCliSessionCredentialMetadata(decoded, claims);
  }

  if (claims.typ === SCOPED_ACCESS_TYP) {
    const audience = readScopedAccessAudience(decoded);
    if (audience === null) {
      throw Object.assign(new Error("Invalid session credential."), { code: "auth.invalid" });
    }
    return readScopedAccessCredentialMetadata(claims, audience);
  }

  throw Object.assign(new Error("Invalid session credential."), { code: "auth.invalid" });
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
  if (claims === null) {
    throw Object.assign(new Error("Invalid session credential."), { code: "auth.invalid" });
  }

  assertCredentialNotExpired(claims);
  return readVerifiedCredentialMetadata(decoded, claims);
}
