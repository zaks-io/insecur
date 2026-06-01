export interface WorkOSAuthenticatedUser {
  readonly id: string;
  readonly email?: string;
}

export type WorkOSSessionAuthenticateResult =
  | {
      readonly authenticated: true;
      readonly user: WorkOSAuthenticatedUser;
      readonly sessionId: string;
    }
  | {
      readonly authenticated: false;
      readonly reason: "expired" | "invalid" | "missing";
    };

/** Port for WorkOS sealed session validation (test doubles avoid network). */
export interface WorkOSSessionPort {
  authenticateSealedSession(sessionData: string): Promise<WorkOSSessionAuthenticateResult>;
}
