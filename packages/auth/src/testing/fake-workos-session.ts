import type { WorkOSAuthFactorSummary } from "../mfa-posture.js";
import type {
  WorkOSSessionAuthenticateResult,
  WorkOSSessionContext,
  WorkOSSessionPort,
  WorkOSSessionRefreshResult,
} from "../workos-session-port.js";

const registeredPasskeysByUser = new Map<string, boolean>();

export function resetFakeRegisteredPasskeysForTests(): void {
  registeredPasskeysByUser.clear();
}

export interface FakeWorkOSSessionEntry {
  readonly sessionData: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly authorizationCode?: string;
  readonly codeVerifier?: string;
  readonly authorizationCodeFailure?:
    "expired" | "invalid" | "missing" | "mfa_enrollment" | "mfa_challenge";
  /** When set, authorization-code exchange throws instead of returning a mapped OAuth failure. */
  readonly authorizationCodeThrow?: Error;
  readonly email?: string;
  readonly authenticationMethod?: string;
  readonly authFactors?: readonly WorkOSAuthFactorSummary[];
  /** When set, refresh returns this sealed session value (rotation). */
  readonly rotatedSessionData?: string;
  readonly authenticateFailure?: "expired" | "invalid" | "missing";
  readonly refreshFailure?: "expired" | "invalid" | "missing" | "mfa_enrollment";
  readonly registeredPasskey?: boolean;
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
  if (input.loginHint !== undefined) {
    params.set("login_hint", input.loginHint);
  }
  if (input.maxAge !== undefined) {
    params.set("max_age", String(input.maxAge));
  }
  return `https://workos.test/authorize?${params.toString()}`;
}

function authenticateFakeAuthorizationCode(
  entries: readonly FakeWorkOSSessionEntry[],
  consumedCodes: Set<string>,
  input: Parameters<WorkOSSessionPort["authenticateAuthorizationCode"]>[0],
): ReturnType<WorkOSSessionPort["authenticateAuthorizationCode"]> {
  const entry = entries.find((candidate) => candidate.authorizationCode === input.code);
  if (entry === undefined) {
    return Promise.resolve({ authenticated: false, reason: "invalid" });
  }
  // WorkOS authorization codes are single-use: a redeemed code cannot be exchanged again. Modeling
  // that here means a double exchange of one step-up code fails in tests instead of silently
  // passing, guarding against a regression of the BFF+API double-exchange (INS-517).
  if (consumedCodes.has(input.code)) {
    return Promise.resolve({ authenticated: false, reason: "invalid" });
  }
  if (entry.codeVerifier !== undefined && entry.codeVerifier !== input.codeVerifier) {
    return Promise.resolve({ authenticated: false, reason: "invalid" });
  }
  if (entry.authorizationCodeFailure !== undefined) {
    return Promise.resolve({ authenticated: false, reason: entry.authorizationCodeFailure });
  }
  if (entry.authorizationCodeThrow !== undefined) {
    throw entry.authorizationCodeThrow;
  }
  consumedCodes.add(input.code);
  return Promise.resolve({
    authenticated: true,
    context: contextFromEntry(entry),
    sealedSession: entry.sessionData,
  });
}

function seedRegisteredPasskeys(entries: readonly FakeWorkOSSessionEntry[]): void {
  for (const entry of entries) {
    if (entry.registeredPasskey) {
      registeredPasskeysByUser.set(entry.userId, true);
    }
  }
}

function authenticateFakeSealedSession(
  bySession: Map<string, FakeWorkOSSessionEntry>,
  sessionData: string,
): Promise<WorkOSSessionAuthenticateResult> {
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
}

function refreshFakeSealedSession(
  bySession: Map<string, FakeWorkOSSessionEntry>,
  sessionData: string,
): Promise<WorkOSSessionRefreshResult> {
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
}

export function createFakeWorkOSSessionPort(
  entries: readonly FakeWorkOSSessionEntry[],
): WorkOSSessionPort {
  const bySession = new Map(entries.map((entry) => [entry.sessionData, entry]));
  const consumedCodes = new Set<string>();
  seedRegisteredPasskeys(entries);

  return {
    createAuthorizationUrl: fakeAuthorizationUrl,

    authenticateAuthorizationCode: (input) =>
      authenticateFakeAuthorizationCode(entries, consumedCodes, input),

    authenticateSealedSession: (sessionData) =>
      authenticateFakeSealedSession(bySession, sessionData),

    refreshSealedSession: (sessionData) => refreshFakeSealedSession(bySession, sessionData),

    listAuthFactors(userId: string): Promise<readonly WorkOSAuthFactorSummary[]> {
      const entry = [...bySession.values()].find((candidate) => candidate.userId === userId);
      return Promise.resolve(entry?.authFactors ?? []);
    },

    userHasRegisteredPasskey(userId: string): Promise<boolean> {
      return Promise.resolve(registeredPasskeysByUser.get(userId) === true);
    },

    recordUserApprovalPasskeyEnrollment(userId: string): Promise<void> {
      registeredPasskeysByUser.set(userId, true);
      return Promise.resolve();
    },
  };
}
