import type { WorkOSAuthFactorSummary } from "../mfa-posture.js";
import type {
  WorkOSSessionAuthenticateResult,
  WorkOSSessionContext,
  WorkOSSessionPort,
  WorkOSSessionRefreshResult,
} from "../workos-session-port.js";

export interface FakeWorkOSSessionEntry {
  readonly sessionData: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly email?: string;
  readonly authenticationMethod?: string;
  readonly authFactors?: readonly WorkOSAuthFactorSummary[];
  /** When set, refresh returns this sealed session value (rotation). */
  readonly rotatedSessionData?: string;
  readonly refreshFailure?: "expired" | "invalid" | "missing" | "mfa_enrollment";
}

function contextFromEntry(entry: FakeWorkOSSessionEntry): WorkOSSessionContext {
  const context: WorkOSSessionContext = {
    user:
      entry.email === undefined ? { id: entry.userId } : { id: entry.userId, email: entry.email },
    sessionId: entry.sessionId,
    authFactors: entry.authFactors ?? [],
  };
  if (entry.authenticationMethod !== undefined) {
    return { ...context, authenticationMethod: entry.authenticationMethod };
  }
  return context;
}

export function createFakeWorkOSSessionPort(
  entries: readonly FakeWorkOSSessionEntry[],
): WorkOSSessionPort {
  const bySession = new Map(entries.map((entry) => [entry.sessionData, entry]));

  return {
    authenticateSealedSession(sessionData: string): Promise<WorkOSSessionAuthenticateResult> {
      const entry = bySession.get(sessionData);
      if (entry === undefined) {
        return Promise.resolve({ authenticated: false, reason: "invalid" });
      }
      return Promise.resolve({
        authenticated: true,
        context: contextFromEntry(entry),
      });
    },

    refreshSealedSession(sessionData: string): Promise<WorkOSSessionRefreshResult> {
      const entry = bySession.get(sessionData);
      if (entry === undefined) {
        return Promise.resolve({ refreshed: false, reason: "invalid" });
      }
      if (entry.refreshFailure !== undefined) {
        return Promise.resolve({ refreshed: false, reason: entry.refreshFailure });
      }
      const rotated = entry.rotatedSessionData ?? `${sessionData}_rotated`;
      const rotatedEntry: FakeWorkOSSessionEntry = {
        ...entry,
        sessionData: rotated,
      };
      bySession.set(rotated, rotatedEntry);
      return Promise.resolve({
        refreshed: true,
        sealedSession: rotated,
        context: contextFromEntry(rotatedEntry),
      });
    },

    listAuthFactors(userId: string): Promise<readonly WorkOSAuthFactorSummary[]> {
      const entry = [...bySession.values()].find((candidate) => candidate.userId === userId);
      return Promise.resolve(entry?.authFactors ?? []);
    },
  };
}
