import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { SESSION_CACHE_FILE, USER_CONFIG_DIR } from "../config/paths.js";
import type { MemorySession } from "./memory-session.js";

const SESSION_CACHE_VERSION = 1 as const;
const SESSION_CACHE_MODE = 0o600;

export interface CachedCliSession extends MemorySession {
  readonly host: string;
}

interface SessionCachePayload {
  readonly version: typeof SESSION_CACHE_VERSION;
  readonly host: string;
  readonly sessionId: string;
  readonly expiresAt: string;
  readonly credential: string;
}

export function sessionCachePath(): string {
  const override = process.env.INSECUR_SESSION_CACHE_FILE;
  if (override !== undefined && override !== "") {
    return path.resolve(override);
  }
  return path.join(homedir(), USER_CONFIG_DIR, SESSION_CACHE_FILE);
}

function isENOENT(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function isExpired(expiresAt: string): boolean {
  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) {
    return true;
  }
  return Date.now() >= expiresMs;
}

function readNonEmptyString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string" || value === "") {
    return undefined;
  }
  return value;
}

function parseSessionCacheRecord(record: Record<string, unknown>): CachedCliSession | undefined {
  if (record.version !== SESSION_CACHE_VERSION) {
    return undefined;
  }
  const host = readNonEmptyString(record, "host");
  const sessionId = readNonEmptyString(record, "sessionId");
  const expiresAt = readNonEmptyString(record, "expiresAt");
  const credential = readNonEmptyString(record, "credential");
  if (
    host === undefined ||
    sessionId === undefined ||
    expiresAt === undefined ||
    credential === undefined
  ) {
    return undefined;
  }
  if (isExpired(expiresAt)) {
    return undefined;
  }
  return { host, sessionId, expiresAt, credential };
}

function parseSessionCachePayload(raw: string): CachedCliSession | undefined {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }
  return parseSessionCacheRecord(parsed as Record<string, unknown>);
}

export async function readCachedSession(): Promise<CachedCliSession | undefined> {
  const filePath = sessionCachePath();
  try {
    const raw = await readFile(filePath, "utf8");
    const session = parseSessionCachePayload(raw);
    if (session === undefined) {
      await clearCachedSession();
    }
    return session;
  } catch (error) {
    if (isENOENT(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function writeCachedSession(session: CachedCliSession): Promise<void> {
  const filePath = sessionCachePath();
  const payload: SessionCachePayload = {
    version: SESSION_CACHE_VERSION,
    host: session.host,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    credential: session.credential,
  };
  await mkdir(path.dirname(filePath), { recursive: true, mode: SESSION_CACHE_MODE });
  await writeFile(filePath, `${JSON.stringify(payload)}\n`, {
    encoding: "utf8",
    mode: SESSION_CACHE_MODE,
  });
  await chmod(filePath, SESSION_CACHE_MODE);
}

export async function clearCachedSession(): Promise<void> {
  const filePath = sessionCachePath();
  try {
    await unlink(filePath);
  } catch (error) {
    if (isENOENT(error)) {
      return;
    }
    throw error;
  }
}
