#!/usr/bin/env node
/**
 * ADR-0054 guardrails for the postgres-integration RLS gate.
 * Ensures migration and runtime URLs differ and the runtime role cannot bypass RLS.
 */
import postgres from "postgres";
import { loadRepoEnvLocal, requireDatabaseUrl } from "./lib/env-local.mjs";

loadRepoEnvLocal();

const runtimeUrl = requireDatabaseUrl("DATABASE_URL_RUNTIME");
const migrationUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION");

if (runtimeUrl === migrationUrl) {
  console.error("RLS guardrail failed: DATABASE_URL_RUNTIME must not equal DATABASE_URL_MIGRATION");
  process.exit(1);
}

const sql = postgres(runtimeUrl, { max: 1, prepare: false, connect_timeout: 5 });
try {
  const rows = await sql`
    SELECT rolbypassrls AS bypasses_rls
    FROM pg_roles
    WHERE rolname = current_user
  `;
  const bypassesRls = rows[0]?.bypasses_rls;
  if (bypassesRls !== false) {
    console.error(
      `RLS guardrail failed: runtime role must have rolbypassrls = false (got ${String(bypassesRls)})`,
    );
    process.exit(1);
  }
} finally {
  await sql.end({ timeout: 5 });
}

console.log("OK RLS credential guardrails (distinct URLs, runtime NOBYPASSRLS)");
