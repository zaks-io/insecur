/**
 * Classification of transient database connection-layer failures (INS-603).
 *
 * postgres.js surfaces server failures with `code` set to the SQLSTATE and its own client-side
 * failures with symbolic codes (`CONNECT_TIMEOUT`, `CONNECTION_CLOSED`). Hyperdrive reports origin
 * pool-slot exhaustion as SQLSTATE `58000` ("Timed out while waiting for an open slot in the
 * pool"), which previously leaked to callers as a non-retryable 500 with the raw SQLSTATE as the
 * public error code.
 */

/**
 * Enumerated transient SQLSTATEs. Deliberately NOT whole-class matching: persistent faults inside
 * class 08/58 (08P01 protocol_violation, 58P01 undefined_file, 58P02 duplicate_file) never clear
 * on retry, and 08007 transaction_resolution_unknown means the COMMIT fate is unknown — a client
 * honoring `retryable: true` could re-issue a write that already committed, so it stays
 * non-retryable like any unknown error.
 */
const TRANSIENT_SQLSTATES = new Set([
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "08006", // connection_failure
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "58000", // system_error (Hyperdrive pool-slot exhaustion)
  "58030", // io_error
]);

/** postgres.js client-side codes for connection loss or connect timeout. */
const TRANSIENT_CLIENT_CODES = new Set(["CONNECT_TIMEOUT", "CONNECTION_CLOSED"]);

/**
 * Failures that occur while acquiring a connection, before any statement of the transaction can
 * have run: connection-establishment rejections and client-side connect timeouts. Only these are
 * safe for an in-place transaction retry; later connection loss could follow a commit whose ack
 * was lost. SQLSTATE 58000 is handled separately because it is a generic system_error: it only
 * qualifies together with Hyperdrive's pool-wait message.
 */
const ACQUISITION_FAILURE_CODES = new Set(["57P03", "08001", "08004", "CONNECT_TIMEOUT"]);

/** Hyperdrive's origin pool-slot wait timeout ("Timed out while waiting for an open slot in the pool"). */
const HYPERDRIVE_POOL_WAIT_MESSAGE = /waiting for an open slot/i;

function readCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    if (typeof code === "string") {
      return code;
    }
  }
  return undefined;
}

function readMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

/**
 * True when the error is a transient database connection-layer failure: enumerated connection
 * exceptions (class 08), external system errors such as Hyperdrive pool exhaustion (58000/58030),
 * server shutdown (57P01/57P02/57P03), or postgres.js connect timeouts and unexpected socket
 * closes. Matching means "map to a generic unavailable code, do not leak the SQLSTATE" — NOT
 * "safe to retry": mid-flight losses (CONNECTION_CLOSED, 08000/08003/08006) can follow a COMMIT
 * whose ack was lost, so only `isConnectionAcquisitionFailure` decides retryability. Data,
 * constraint, and authorization SQLSTATEs — and ambiguous or persistent faults like
 * 08007/08P01/58P01/58P02 — never match, so real errors keep failing closed.
 */
export function isTransientConnectionError(error: unknown): boolean {
  const code = readCode(error);
  if (code === undefined) {
    return false;
  }
  return TRANSIENT_CLIENT_CODES.has(code) || TRANSIENT_SQLSTATES.has(code);
}

/**
 * True when the failure happened at connection acquisition, before the transaction body ran.
 * A bare 58000 is a generic system_error and does NOT qualify — only 58000 carrying Hyperdrive's
 * pool-wait message does, since a synthesized 58000 for a mid-flight loss could carry commit
 * ambiguity that an in-place retry would double-apply.
 */
export function isConnectionAcquisitionFailure(error: unknown): boolean {
  const code = readCode(error);
  if (code === undefined) {
    return false;
  }
  if (ACQUISITION_FAILURE_CODES.has(code)) {
    return true;
  }
  return code === "58000" && HYPERDRIVE_POOL_WAIT_MESSAGE.test(readMessage(error));
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
