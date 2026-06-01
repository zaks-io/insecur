import {
  createFakeWorkOSSessionPort,
  createWorkOSSessionPort,
  type WorkOSSessionPort,
} from "@insecur/auth";
import type { WorkerEnv } from "../env.js";
import { createAuthConfig } from "./config.js";

interface FakeSessionEntry {
  readonly sessionData: string;
  readonly userId: string;
  readonly sessionId: string;
}

function parseFakeSessionEntry(item: unknown): FakeSessionEntry | null {
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
  };
}

function parseFakeSessions(raw: string | undefined): FakeSessionEntry[] {
  if (raw === undefined || raw.trim() === "") {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((item) => parseFakeSessionEntry(item))
    .filter((entry): entry is FakeSessionEntry => entry !== null);
}

/** Uses fake sessions in development when WORKOS_FAKE_SESSIONS_JSON is set. */
export function createWorkOSSessionPortFromEnv(env: WorkerEnv): WorkOSSessionPort {
  const fakeEntries = parseFakeSessions(env.WORKOS_FAKE_SESSIONS_JSON);
  if (fakeEntries.length > 0) {
    return createFakeWorkOSSessionPort(fakeEntries);
  }
  return createWorkOSSessionPort(createAuthConfig(env).workos);
}
