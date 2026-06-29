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
  readonly authorizationCode?: string;
  readonly codeVerifier?: string;
  readonly email?: string;
  readonly authenticationMethod?: string;
  readonly authFactors?: readonly WorkOSAuthFactorSummary[];
  /** When set, refresh returns this sealed session value (rotation). */
  readonly rotatedSessionData?: string;
  readonly authenticateFailure?: "expired" | "invalid" | "missing";
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

function fakeAuthorizationUrl(input: Parameters<WorkOSSessionPort["createAuthorizationUrl"]>[0]) {
  const params = new URLSearchParams({
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
  });
  if (input.screenHint !== undefined) {
    params.set("screen_hint", input.screenHint);
  }
  return `https://workos.test/authorize?${params.toString()}`;
}

function authenticateFakeAuthorizationCode(
  entries: readonly FakeWorkOSSessionEntry[],
  input: Parameters<WorkOSSessionPort["authenticateAuthorizationCode"]>[0],
): ReturnType<WorkOSSessionPort["authenticateAuthorizationCode"]> {
  const entry = entries.find((candidate) => candidate.authorizationCode === input.code);
  if (entry === undefined) {
    return Promise.resolve({ authenticated: false, reason: "invalid" });
  }
  if (entry.codeVerifier !== undefined && entry.codeVerifier !== input.codeVerifier) {
    return Promise.resolve({ authenticated: false, reason: "invalid" });
  }
  if (entry.refreshFailure !== undefined) {
    return Promise.resolve({ authenticated: false, reason: entry.refreshFailure });
  }
  return Promise.resolve({ authenticated: true, context: contextFromEntry(entry) });
}

export function createFakeWorkOSSessionPort(
  entries: readonly FakeWorkOSSessionEntry[],
): WorkOSSessionPort {
  const bySession = new Map(entries.map((entry) => [entry.sessionData, entry]));

  return {
    createAuthorizationUrl: fakeAuthorizationUrl,

    authenticateAuthorizationCode: (input) => authenticateFakeAuthorizationCode(entries, input),

    authenticateSealedSession(sessionData: string): Promise<WorkOSSessionAuthenticateResult> {
      const entry = bySession.get(sessionData);
      if (entry === undefined) {
        return Promise.resolve({ authenticated: false, reason: "invalid" });
      }
      if (entry.authenticateFailure !== undefined) {
        return Promise.resolve({ authenticated: false, reason: entry.authenticateFailure });
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
