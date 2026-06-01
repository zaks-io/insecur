import type { WorkOSSessionAuthenticateResult, WorkOSSessionPort } from "../workos-session-port.js";

export interface FakeWorkOSSessionEntry {
  readonly sessionData: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly email?: string;
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
      const user =
        entry.email === undefined ? { id: entry.userId } : { id: entry.userId, email: entry.email };
      return Promise.resolve({
        authenticated: true,
        user,
        sessionId: entry.sessionId,
      });
    },
  };
}
