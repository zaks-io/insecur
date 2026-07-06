export interface LockMetadata {
  readonly pid: number;
  readonly acquiredAt: number;
  readonly token?: string;
}

export const LOCK_STALE_MS = 30_000;

function isLockMetadataRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseLockMetadata(parsed: unknown): LockMetadata | null {
  if (!isLockMetadataRecord(parsed)) {
    return null;
  }
  const { pid, acquiredAt, token } = parsed;
  if (typeof pid !== "number" || typeof acquiredAt !== "number") {
    return null;
  }
  if (token !== undefined && (typeof token !== "string" || token === "")) {
    return null;
  }
  return token === undefined ? { pid, acquiredAt } : { pid, acquiredAt, token };
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isMetadataStale(metadata: LockMetadata): boolean {
  if (!isPidAlive(metadata.pid)) {
    return true;
  }
  return Date.now() - metadata.acquiredAt > LOCK_STALE_MS;
}

export function lockMetadataIdentityMatches(
  current: LockMetadata | null,
  expected: LockMetadata,
): boolean {
  if (current === null) {
    return false;
  }
  if (
    current.token !== undefined &&
    expected.token !== undefined &&
    current.token !== "" &&
    expected.token !== ""
  ) {
    return current.token === expected.token;
  }
  return current.pid === expected.pid && current.acquiredAt === expected.acquiredAt;
}
