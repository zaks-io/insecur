import type { RequestId } from "@insecur/domain";
import type { AdmittedUserResolver } from "./admitted-user.js";
import {
  authFailureForAdmissionDenial,
  authFailureForReason,
  type AuthFailure,
} from "./auth-failure.js";
import { mintEphemeralSessionCredential } from "./ephemeral-session.js";
import { authFailureForAssuranceReason } from "./resolve-workos-session.js";
import { evaluateSessionAssurance } from "./session-assurance.js";
import type { InsecurAuthConfig } from "./workos-config.js";
import type {
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

export async function startCliDeviceAuthorization(
  workos: WorkOSSessionPort,
): Promise<CliDeviceAuthorizationStart> {
  const started = await workos.startDeviceAuthorization();
  return {
    deviceCode: started.deviceCode,
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
    }
  | { readonly ok: true; readonly status: "authorization_pending" | "slow_down" }
  | { readonly ok: false; readonly failure: AuthFailure };

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
function nonAuthenticatedResult(token: NonAuthenticatedToken): CliDeviceSessionExchangeResult {
  switch (token.status) {
    case "authorization_pending":
    case "slow_down":
      return { ok: true, status: token.status };
    case "denied":
      return { ok: false, failure: authFailureForReason("device_authorization_denied") };
    case "expired":
      return { ok: false, failure: authFailureForReason("device_authorization_expired") };
    case "invalid":
      return { ok: false, failure: authFailureForReason(token.reason) };
  }
}

async function mintDeviceSession(
  input: CliDeviceSessionExchangeInput,
  context: WorkOSSessionContext,
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
  const token = await input.workos.authenticateDeviceCode(input.deviceCode);
  if (token.status !== "authenticated") {
    return nonAuthenticatedResult(token);
  }
  return mintDeviceSession(input, token.context);
}
