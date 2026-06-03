import postgres from "postgres";
import { loadRepoEnvLocal, requireDatabaseUrl } from "../../scripts/lib/env-local.mjs";

loadRepoEnvLocal();

async function isRuntimeDatabaseReachable(url: string): Promise<boolean> {
  const sql = postgres(url, { max: 1, connect_timeout: 2 });
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

let runtimeUrl: string | undefined;
try {
  runtimeUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
} catch {
  runtimeUrl = undefined;
}

/** True when DATABASE_URL_RUNTIME is configured and Postgres accepts connections. */
export const integrationDatabaseReady =
  runtimeUrl !== undefined && (await isRuntimeDatabaseReachable(runtimeUrl));

if (process.env.INSECUR_CI_RLS_GATE === "1" && !integrationDatabaseReady) {
  throw new Error(
    "CI RLS gate requires DATABASE_URL_RUNTIME to be configured and Postgres to accept connections",
  );
}
