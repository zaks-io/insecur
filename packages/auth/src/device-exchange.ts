import type { RequestId, UserId } from "@insecur/domain";
import type { AdmittedUserResolver } from "./admitted-user.js";
import {
  authFailureForAdmissionDenial,
  authFailureForReason,
  type AuthFailure,
} from "./auth-failure.js";
import { mintEphemeralSessionCredential } from "./ephemeral-session.js";
import { decodeHmacToken, encodeHmacToken, type TokenClaims } from "./hmac-token.js";
import { authFailureForAssuranceReason } from "./resolve-workos-session.js";
import { evaluateSessionAssurance } from "./session-assurance.js";
import type { InsecurAuthConfig } from "./workos-config.js";
import type {
  WorkOSDeviceAuthorizationResult,
  WorkOSDeviceTokenResult,
  WorkOSSessionContext,
  WorkOSSessionPort,
} from "./workos-session-port.js";

/** Public metadata the CLI shows to the human and uses to drive its polling loop. */
export interface CliDeviceAuthorizationStart {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete?: string;
  readonly expiresInSeconds: number;
  readonly intervalSeconds: number;
}

const DEVICE_AUTHORIZATION_TYP = "insecur_cli_device_authorization_v1";

export interface CliDeviceAuthorizationIntent {
  readonly agentSession: boolean;
  readonly requesterHost?: string;
  readonly requesterIp?: string;
}

export interface CliDeviceAuthorizationAuditContext {
  readonly agentSession: boolean;
  readonly requesterHost?: string;
  readonly requesterIp?: string;
}

interface BoundDeviceAuthorization extends CliDeviceAuthorizationAuditContext {
  readonly deviceCode: string;
}

async function bindDeviceAuthorization(
  started: WorkOSDeviceAuthorizationResult,
  intent: CliDeviceAuthorizationIntent,
  signingSecret: string,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return encodeHmacToken(
    {
      dc: started.deviceCode,
      agt: intent.agentSession,
      ...(intent.requesterHost === undefined ? {} : { rqh: intent.requesterHost }),
      ...(intent.requesterIp === undefined ? {} : { rip: intent.requesterIp }),
      iat: issuedAt,
      exp: issuedAt + started.expiresInSeconds,
      typ: DEVICE_AUTHORIZATION_TYP,
    },
    signingSecret,
  );
}

async function readBoundDeviceAuthorization(
  handle: string,
  signingSecret: string,
): Promise<BoundDeviceAuthorization | null> {
  const claims = await decodeHmacToken(handle, signingSecret);
  return claims === null ? null : boundDeviceAuthorizationFromClaims(claims);
}

function hasValidDeviceAuthorizationLifetime(claims: TokenClaims): boolean {
  const now = Math.floor(Date.now() / 1000);
  return (
    typeof claims.iat === "number" &&
    typeof claims.exp === "number" &&
    claims.iat <= now + 60 &&
    claims.exp > now
  );
}

function boundDeviceAuthorizationFromClaims(claims: TokenClaims): BoundDeviceAuthorization | null {
  if (
    claims.typ !== DEVICE_AUTHORIZATION_TYP ||
    typeof claims.dc !== "string" ||
    typeof claims.agt !== "boolean" ||
    !hasValidDeviceAuthorizationLifetime(claims)
  ) {
    return null;
  }
  return {
    deviceCode: claims.dc,
    agentSession: claims.agt,
    ...(typeof claims.rqh === "string" ? { requesterHost: claims.rqh } : {}),
    ...(typeof claims.rip === "string" ? { requesterIp: claims.rip } : {}),
  };
}

export async function startCliDeviceAuthorization(
  workos: WorkOSSessionPort,
  signingSecret: string,
  intent: CliDeviceAuthorizationIntent,
): Promise<CliDeviceAuthorizationStart> {
  const started = await workos.startDeviceAuthorization();
  return {
    deviceCode: await bindDeviceAuthorization(started, intent, signingSecret),
    userCode: started.userCode,
    verificationUri: started.verificationUri,
    ...(started.verificationUriComplete === undefined
      ? {}
      : { verificationUriComplete: started.verificationUriComplete }),
    expiresInSeconds: started.expiresInSeconds,
    intervalSeconds: started.intervalSeconds,
  };
}

export interface CliDeviceSessionExchangeSuccess {
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly agentSessionId?: string;
  readonly requestId?: RequestId;
}

export type CliDeviceSessionExchangeResult =
  | {
      readonly ok: true;
      readonly status: "authenticated";
      readonly credential: string;
      readonly body: CliDeviceSessionExchangeSuccess;
      readonly actorUserId: UserId;
      readonly auditContext: CliDeviceAuthorizationAuditContext;
    }
  | { readonly ok: true; readonly status: "authorization_pending" | "slow_down" }
  | {
      readonly ok: false;
      readonly failure: AuthFailure;
      readonly auditContext?: CliDeviceAuthorizationAuditContext;
    };

export interface CliDeviceSessionExchangeInput {
  readonly deviceCode: string;
  readonly agentSession: boolean;
  readonly config: InsecurAuthConfig;
  readonly workos: WorkOSSessionPort;
  readonly resolveAdmittedUser: AdmittedUserResolver;
  readonly requestId?: RequestId;
}

function assuranceFailure(context: WorkOSSessionContext): AuthFailure | null {
  const assurance = evaluateSessionAssurance({
    authFactors: context.authFactors,
    ...(context.authenticationMethod !== undefined
      ? { authenticationMethod: context.authenticationMethod }
      : {}),
  });
  // Reuse the exhaustive session-assurance → AuthFailure mapping so a future assurance reason is
  // not silently misclassified (shared with the loopback/sealed-session paths).
  return assurance.ok ? null : authFailureForAssuranceReason(assurance.reason);
}

type NonAuthenticatedToken = Exclude<WorkOSDeviceTokenResult, { status: "authenticated" }>;

/** Maps every non-authenticated device-token status to the CLI exchange result. */
function nonAuthenticatedResult(
  token: NonAuthenticatedToken,
  auditContext: CliDeviceAuthorizationAuditContext,
): CliDeviceSessionExchangeResult {
  switch (token.status) {
    case "authorization_pending":
    case "slow_down":
      return { ok: true, status: token.status };
    case "denied":
      return {
        ok: false,
        failure: authFailureForReason("device_authorization_denied"),
        auditContext,
      };
    case "expired":
      return {
        ok: false,
        failure: authFailureForReason("device_authorization_expired"),
        auditContext,
      };
    case "invalid":
      return { ok: false, failure: authFailureForReason(token.reason) };
  }
}

async function mintDeviceSession(
  input: CliDeviceSessionExchangeInput,
  context: WorkOSSessionContext,
  auditContext: CliDeviceAuthorizationAuditContext,
): Promise<CliDeviceSessionExchangeResult> {
  const assurance = assuranceFailure(context);
  if (assurance !== null) {
    return { ok: false, failure: assurance };
  }
  const admitted = await input.resolveAdmittedUser(context.user.id);
  if (admitted === null || admitted === "cli_session_revoked") {
    return { ok: false, failure: authFailureForAdmissionDenial(context.user.id) };
  }
  const minted = await mintEphemeralSessionCredential({
    actor: {
      type: "user",
      userId: admitted,
      workosUserId: context.user.id,
      sessionId: context.sessionId,
    },
    signingSecret: input.config.sessionSigningSecret,
    ...(input.agentSession ? { agentMarked: true } : {}),
  });
  return {
    ok: true,
    status: "authenticated",
    credential: minted.credential,
    actorUserId: admitted,
    auditContext,
    body: {
      sessionId: context.sessionId,
      expiresAt: minted.expiresAt,
      ...(minted.agentSessionId === undefined ? {} : { agentSessionId: minted.agentSessionId }),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    },
  };
}

/**
 * Exchanges a WorkOS device code for a short-lived CLI credential. One poll per call: the CLI owns
 * the polling loop and respects the returned pending / slow_down states (RFC 8628). `agentSession`
 * mints the credential agent-marked (ADR-0010 `--device --agent-session`).
 */
export async function exchangeCliDeviceSession(
  input: CliDeviceSessionExchangeInput,
): Promise<CliDeviceSessionExchangeResult> {
  const authorization = await readBoundDeviceAuthorization(
    input.deviceCode,
    input.config.sessionSigningSecret,
  );
  if (authorization?.agentSession !== input.agentSession) {
    return { ok: false, failure: authFailureForReason("invalid") };
  }
  const token = await input.workos.authenticateDeviceCode(authorization.deviceCode);
  const auditContext: CliDeviceAuthorizationAuditContext = {
    agentSession: authorization.agentSession,
    ...(authorization.requesterHost === undefined
      ? {}
      : { requesterHost: authorization.requesterHost }),
    ...(authorization.requesterIp === undefined ? {} : { requesterIp: authorization.requesterIp }),
  };
  if (token.status !== "authenticated") {
    return nonAuthenticatedResult(token, auditContext);
  }
  return mintDeviceSession(
    { ...input, agentSession: authorization.agentSession },
    token.context,
    auditContext,
  );
}
