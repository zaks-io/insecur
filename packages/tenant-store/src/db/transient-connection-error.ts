/**
 * Classification of transient database connection-layer failures (INS-603).
 *
 * postgres.js surfaces server failures with `code` set to the SQLSTATE and its own client-side
 * failures with symbolic codes (`CONNECT_TIMEOUT`, `CONNECTION_CLOSED`). Hyperdrive reports origin
 * pool-slot exhaustion as SQLSTATE `58000` ("Timed out while waiting for an open slot in the
 * pool"), which previously leaked to callers as a non-retryable 500 with the raw SQLSTATE as the
 * public error code.
 */

/** SQLSTATE class 08 (connection exception) and class 58 (system errors external to Postgres). */
const TRANSIENT_SQLSTATE_CLASSES = new Set(["08", "58"]);

/** Server-shutdown / cannot-connect SQLSTATEs from class 57 (operator intervention). */
const TRANSIENT_SQLSTATES = new Set(["57P01", "57P02", "57P03"]);

/** postgres.js client-side codes for connection loss or connect timeout. */
const TRANSIENT_CLIENT_CODES = new Set(["CONNECT_TIMEOUT", "CONNECTION_CLOSED"]);

/**
 * Failures that occur while acquiring a connection, before any statement of the transaction can
 * have run: Hyperdrive pool-wait timeout (58000 fires when the origin pool has no free slot),
 * connection-establishment rejections, and client-side connect timeouts. Only these are safe for
 * an in-place transaction retry; later connection loss could follow a commit whose ack was lost.
 */
const ACQUISITION_FAILURE_CODES = new Set(["58000", "57P03", "08001", "08004", "CONNECT_TIMEOUT"]);

function readCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    if (typeof code === "string") {
      return code;
    }
  }
  return undefined;
}

function isSqlstate(code: string): boolean {
  return /^[0-9A-Z]{5}$/.test(code);
}

/**
 * True when the error is a transient database connection-layer failure that a caller may safely
 * retry: connection exceptions (class 08), external system errors such as Hyperdrive pool
 * exhaustion (class 58), server shutdown (57P01/57P02/57P03), or postgres.js connect timeouts and
 * unexpected socket closes. Data, constraint, and authorization SQLSTATEs never match, so real
 * errors keep failing closed.
 */
export function isTransientConnectionError(error: unknown): boolean {
  const code = readCode(error);
  if (code === undefined) {
    return false;
  }
  if (TRANSIENT_CLIENT_CODES.has(code)) {
    return true;
  }
  if (!isSqlstate(code)) {
    return false;
  }
  return TRANSIENT_SQLSTATES.has(code) || TRANSIENT_SQLSTATE_CLASSES.has(code.slice(0, 2));
}

/** True when the failure happened at connection acquisition, before the transaction body ran. */
export function isConnectionAcquisitionFailure(error: unknown): boolean {
  return ACQUISITION_FAILURE_CODES.has(readCode(error) ?? "");
}

/**
 * Run `attempt` and retry it exactly once when it fails at connection acquisition. The retried
 * work re-enters Hyperdrive's pool-wait queue, which is itself the backoff; no statement executed
 * on the failed attempt, so the retry cannot double-apply effects. Every other failure — including
 * mid-transaction connection loss — propagates unchanged so the caller decides.
 */
export async function retryOnceOnConnectionAcquisitionFailure<T>(
  attempt: () => Promise<T>,
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!isConnectionAcquisitionFailure(error)) {
      throw error;
    }
    return attempt();
  }
}
