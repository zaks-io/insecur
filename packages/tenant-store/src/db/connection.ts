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

export function getRuntimeSql(): PostgresSql {
  const url = process.env.DATABASE_URL_RUNTIME;
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
  }
}
