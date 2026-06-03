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

/** Port for WorkOS sealed session validation (test doubles avoid network). */
export interface WorkOSSessionPort {
  authenticateSealedSession(sessionData: string): Promise<WorkOSSessionAuthenticateResult>;
  refreshSealedSession(sessionData: string): Promise<WorkOSSessionRefreshResult>;
  listAuthFactors(userId: string): Promise<readonly WorkOSAuthFactorSummary[]>;
}
