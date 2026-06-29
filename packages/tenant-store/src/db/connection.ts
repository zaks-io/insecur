import { AsyncLocalStorage } from "node:async_hooks";

import { STORE_ERROR_CODES, type StoreErrorCode } from "@insecur/domain";
import postgres from "postgres";

export type PostgresSql = ReturnType<typeof postgres>;

/** Runtime database URL is not configured; fail closed before opening a pool. */
export class RuntimeConfigMissingError extends Error {
  readonly code: StoreErrorCode = STORE_ERROR_CODES.runtimeConfigMissing;
  readonly retryable = false;

  constructor() {
    super("runtime database configuration is required");
    this.name = "RuntimeConfigMissingError";
  }
}

/**
 * Per-request connection state. On Cloudflare Workers a `postgres.js` client's socket promises are
 * pinned to the I/O context of the request that created them; reusing one client across RPC
 * invocations cancels its continuations ("promise resolved from a different request context",
 * ADR-0077). The Worker therefore opens a client inside the request via {@link runWithRuntimeConnection}
 * and stores it here for the duration of that request. `tenantDb` is the Drizzle client lazily built
 * over the same `sql` so every entry point shares one connection per request. Nothing here outlives
 * the request.
 */
export interface RuntimeConnection {
  readonly sql: PostgresSql;
  tenantDb?: unknown;
}

const connectionStore = new AsyncLocalStorage<RuntimeConnection>();

/**
 * Open a request-scoped runtime DB client for the duration of `fn` and store it in async-local
 * storage so the connection-agnostic store API (`withTenantScope`/`getRuntimeSql`) resolves it
 * without threading a handle through ~40 call sites. `max: 1` because Hyperdrive pools server-side;
 * the Worker-side client is short-lived and per-request. The socket `end()` is returned (not
 * awaited) so the Worker can hand it to `ctx.waitUntil` and never block the response.
 *
 * One isolate serves one Instance and therefore one connection string (ADR-0036/0037; RLS does
 * tenant isolation, not per-org connections), but each request still gets its own client so no
 * socket is ever shared across request contexts.
 */
export async function runWithRuntimeConnection<T>(
  connStr: string,
  fn: () => Promise<T>,
): Promise<{ result: T; closing: Promise<void> }> {
  if (!connStr) {
    throw new RuntimeConfigMissingError();
  }
  const sql = postgres(connStr, { prepare: false, max: 1 });
  try {
    const result = await connectionStore.run({ sql }, fn);
    return { result, closing: endQuietly(sql) };
  } catch (error) {
    // Close on the failure path too; the entry only waitUntil's the success-path promise.
    void endQuietly(sql);
    throw error;
  }
}

function endQuietly(sql: PostgresSql): Promise<void> {
  return Promise.resolve(sql.end({ timeout: 5 })).catch(() => undefined);
}

/** Read the active request-scoped connection, or undefined outside a {@link runWithRuntimeConnection} scope. */
export function activeRuntimeConnection(): RuntimeConnection | undefined {
  return connectionStore.getStore();
}

// --- Node/local fallback singleton (tests + local iteration; never the Worker path) ---
//
// Integration, RLS, and unit suites run in plain Node with no request context, so they configure a
// connection string once and reuse a lazy pool. This path has no cross-request-context hazard
// (single Node context), and the Worker never uses it (it always runs inside runWithRuntimeConnection).

let fallbackPool: PostgresSql | undefined;
let configuredUrl: string | undefined;

/**
 * Set the runtime database connection string for the Node/local fallback path (tests, local
 * iteration). The Worker boundary does NOT use this — it opens a request-scoped client via
 * {@link runWithRuntimeConnection}. A different non-empty string after the pool is open is a
 * misconfiguration: fail loud rather than silently route a tenant at the wrong DB.
 */
export function configureRuntimeConnection(connStr: string): void {
  if (!connStr) {
    throw new RuntimeConfigMissingError();
  }
  if (fallbackPool && configuredUrl !== undefined && configuredUrl !== connStr) {
    throw new Error("runtime connection string changed after pool creation");
  }
  configuredUrl = connStr;
}

export function getRuntimeSql(): PostgresSql {
  const active = connectionStore.getStore();
  if (active) {
    return active.sql;
  }
  const url = configuredUrl ?? process.env.DATABASE_URL_RUNTIME;
  if (!url) {
    throw new RuntimeConfigMissingError();
  }
  fallbackPool ??= postgres(url, { prepare: false, max: 10 });
  return fallbackPool;
}

export async function closeRuntimeSql(): Promise<void> {
  if (fallbackPool) {
    await fallbackPool.end({ timeout: 5 });
    fallbackPool = undefined;
    const { resetRuntimeTenantDb } = await import("../tenant-scoped-db.js");
    resetRuntimeTenantDb();
  }
  configuredUrl = undefined;
}
