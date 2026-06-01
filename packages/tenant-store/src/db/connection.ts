import postgres from "postgres";

export type PostgresSql = ReturnType<typeof postgres>;

let runtimePool: PostgresSql | undefined;

export function getRuntimeSql(): PostgresSql {
  const url = process.env.DATABASE_URL_RUNTIME;
  if (!url) {
    throw new Error("DATABASE_URL_RUNTIME is required");
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
