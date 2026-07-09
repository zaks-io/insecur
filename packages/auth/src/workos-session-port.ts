import type { WorkOSAuthFactorSummary } from "./mfa-posture.js";

export interface WorkOSAuthenticatedUser {
  readonly id: string;
  readonly email?: string;
}

export interface WorkOSSessionContext {
  readonly user: WorkOSAuthenticatedUser;
  readonly sessionId: string;
  readonly authenticationMethod?: string;
  readonly authFactors: readonly WorkOSAuthFactorSummary[];
}

export type WorkOSSessionAuthenticateResult =
  | {
      readonly authenticated: true;
      readonly context: WorkOSSessionContext;
    }
  | {
      readonly authenticated: false;
      readonly reason: "expired" | "invalid" | "missing";
    };

export type WorkOSSessionRefreshResult =
  | {
      readonly refreshed: true;
      readonly sealedSession: string;
      readonly context: WorkOSSessionContext;
    }
  | {
      readonly refreshed: false;
      readonly reason: "expired" | "invalid" | "missing" | "mfa_enrollment";
    };

export interface WorkOSAuthorizationUrlInput {
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: "S256";
  readonly screenHint?: "sign-in" | "sign-up";
  readonly loginHint?: string;
  /** Forces re-authentication in AuthKit; used to surface passkey enrollment for signed-in members. */
  readonly maxAge?: number;
}

export interface WorkOSAuthorizationCodeInput {
  readonly code: string;
  readonly codeVerifier: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export type WorkOSAuthorizationCodeResult =
  | {
      readonly authenticated: true;
      readonly context: WorkOSSessionContext;
      readonly sealedSession: string;
    }
  | {
      readonly authenticated: false;
      readonly reason: "expired" | "invalid" | "missing" | "mfa_enrollment" | "mfa_challenge";
    };

/** Device-authorization request result (OAuth 2.0 Device Authorization Grant, RFC 8628). */
export interface WorkOSDeviceAuthorizationResult {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly verificationUri: string;
  readonly verificationUriComplete?: string;
  readonly expiresInSeconds: number;
  readonly intervalSeconds: number;
}

/**
 * Result of polling the device-code token endpoint. `authorization_pending` and `slow_down` are
 * non-terminal polling states; the terminal outcomes are success, `denied`, `expired`, or `invalid`.
 */
export type WorkOSDeviceTokenResult =
  | {
      // The WorkOS device-code grant returns access_token/refresh_token/user but no sealed session
      // (unlike authenticateWithCode); the broker mints its own credential from the access-token
      // claims, so no sealed session is carried here.
      readonly status: "authenticated";
      readonly context: WorkOSSessionContext;
    }
  | { readonly status: "authorization_pending" }
  | { readonly status: "slow_down" }
  | { readonly status: "denied" }
  | { readonly status: "expired" }
  | { readonly status: "invalid"; readonly reason: "mfa_enrollment" | "mfa_challenge" | "invalid" };

/** Port for WorkOS user-session operations (test doubles avoid network). */
export interface WorkOSSessionPort {
  createAuthorizationUrl(input: WorkOSAuthorizationUrlInput): string;
  startDeviceAuthorization(): Promise<WorkOSDeviceAuthorizationResult>;
  authenticateDeviceCode(deviceCode: string): Promise<WorkOSDeviceTokenResult>;
  authenticateAuthorizationCode(
    input: WorkOSAuthorizationCodeInput,
  ): Promise<WorkOSAuthorizationCodeResult>;
  authenticateSealedSession(sessionData: string): Promise<WorkOSSessionAuthenticateResult>;
  refreshSealedSession(sessionData: string): Promise<WorkOSSessionRefreshResult>;
  listAuthFactors(userId: string): Promise<readonly WorkOSAuthFactorSummary[]>;
  userHasRegisteredPasskey(userId: string): Promise<boolean>;
  recordUserApprovalPasskeyEnrollment(userId: string): Promise<void>;
}
