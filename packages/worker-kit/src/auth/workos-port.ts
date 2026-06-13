import {
  createFakeWorkOSSessionPort,
  createWorkOSSessionPort,
  type FakeWorkOSSessionEntry,
  type WorkOSAuthFactorSummary,
  type WorkOSSessionPort,
} from "@insecur/auth";
import type { AuthWorkerEnv } from "./auth-worker-env.js";
import { createAuthConfig } from "./config.js";

function parseAuthFactors(value: unknown): readonly WorkOSAuthFactorSummary[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const factors: WorkOSAuthFactorSummary[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const type = (item as Record<string, unknown>).type;
    if (typeof type === "string") {
      factors.push({ type });
    }
  }
  return factors.length > 0 ? factors : undefined;
}

function parseRefreshFailure(value: unknown): FakeWorkOSSessionEntry["refreshFailure"] | undefined {
  if (
    value === "expired" ||
    value === "invalid" ||
    value === "missing" ||
    value === "mfa_enrollment"
  ) {
    return value;
  }
  return undefined;
}

function parseFakeSessionOptionalFields(
  record: Record<string, unknown>,
): Omit<FakeWorkOSSessionEntry, "sessionData" | "userId" | "sessionId"> {
  const authFactors = parseAuthFactors(record.authFactors);
  const refreshFailure = parseRefreshFailure(record.refreshFailure);
  return {
    ...(typeof record.email === "string" ? { email: record.email } : {}),
    ...(typeof record.authenticationMethod === "string"
      ? { authenticationMethod: record.authenticationMethod }
      : {}),
    ...(authFactors !== undefined ? { authFactors } : {}),
    ...(typeof record.rotatedSessionData === "string"
      ? { rotatedSessionData: record.rotatedSessionData }
      : {}),
    ...(refreshFailure !== undefined ? { refreshFailure } : {}),
  };
}

function parseFakeSessionEntry(item: unknown): FakeWorkOSSessionEntry | null {
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const record = item as Record<string, unknown>;
  if (
    typeof record.sessionData !== "string" ||
    typeof record.userId !== "string" ||
    typeof record.sessionId !== "string"
  ) {
    return null;
  }
  return {
    sessionData: record.sessionData,
    userId: record.userId,
    sessionId: record.sessionId,
    ...parseFakeSessionOptionalFields(record),
  };
}

function parseFakeSessions(raw: string | undefined): FakeWorkOSSessionEntry[] {
  if (raw === undefined || raw.trim() === "") {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((item) => parseFakeSessionEntry(item))
    .filter((entry): entry is FakeWorkOSSessionEntry => entry !== null);
}

/** Uses fake sessions in development when WORKOS_FAKE_SESSIONS_JSON is set. */
export function createWorkOSSessionPortFromEnv(env: AuthWorkerEnv): WorkOSSessionPort {
  const fakeEntries = parseFakeSessions(env.WORKOS_FAKE_SESSIONS_JSON);
  if (fakeEntries.length > 0) {
    return createFakeWorkOSSessionPort(fakeEntries);
  }
  return createWorkOSSessionPort(createAuthConfig(env).workos);
}
