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

let runtimePool: PostgresSql | undefined;
let configuredUrl: string | undefined;

/**
 * Set the runtime database connection string resolved at the Worker boundary (the Hyperdrive
 * binding's per-request `env.DB.connectionString`). Hyperdrive connection strings live only on the
 * binding, never on `process.env`, so the Worker must hand the string in here.
 *
 * One isolate serves one Instance and therefore one connection string (ADR-0036/0037; RLS does
 * tenant isolation, not per-org connections). A different non-empty string arriving after the pool
 * is open is a misconfiguration — fail loud rather than silently route a tenant at the wrong DB.
 */
export function configureRuntimeConnection(connStr: string): void {
  if (!connStr) {
    throw new RuntimeConfigMissingError();
  }
  if (runtimePool && configuredUrl !== undefined && configuredUrl !== connStr) {
    throw new Error("runtime connection string changed after pool creation");
  }
  configuredUrl = connStr;
}

export function getRuntimeSql(): PostgresSql {
  const url = configuredUrl ?? process.env.DATABASE_URL_RUNTIME;
  if (!url) {
    throw new RuntimeConfigMissingError();
  }
  runtimePool ??= postgres(url, { prepare: false, max: 10 });
  return runtimePool;
}

export async function closeRuntimeSql(): Promise<void> {
  if (runtimePool) {
    await runtimePool.end({ timeout: 5 });
    runtimePool = undefined;
    const { resetRuntimeTenantDb } = await import("../tenant-scoped-db.js");
    resetRuntimeTenantDb();
  }
  configuredUrl = undefined;
}
