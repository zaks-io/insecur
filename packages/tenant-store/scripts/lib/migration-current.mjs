import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * Expected Drizzle migration journal tail (`when` millis of the last entry).
 * Matches drizzle-orm's `folderMillis` gate in pg-core/dialect.migrate.
 */
export function readExpectedMigrationJournalTail() {
  const journalPath = join(packageRoot, "drizzle/meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const entries = journal.entries;
  if (entries.length === 0) {
    throw new Error("drizzle journal has no migration entries");
  }
  const lastEntry = entries[entries.length - 1];
  const migrationPath = join(packageRoot, `drizzle/${lastEntry.tag}.sql`);
  const query = readFileSync(migrationPath, "utf8");
  return {
    folderMillis: lastEntry.when,
    hash: createHash("sha256").update(query).digest("hex"),
  };
}

async function readAppliedMigrationTail(sql) {
  const rows = await sql`
    SELECT hash, created_at AS "createdAt"
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0];
}

async function hasTenantIsolationPrimitives(sql) {
  const [rlsRow] = await sql`
    SELECT c.relrowsecurity AS "rowSecurity"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'organizations'
  `;
  if (!rlsRow?.rowSecurity) {
    return false;
  }

  const [policyRow] = await sql`
    SELECT 1 AS ok
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_tenant_isolation'
    LIMIT 1
  `;
  return Boolean(policyRow);
}

/**
 * True when Drizzle migrations and tenant RLS primitives match the repo head.
 * Lets parallel test seeds skip migrate.mjs when dev:db:reset (or CI) already applied schema.
 */
export async function isTenantStoreSchemaCurrent(databaseUrl) {
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    const expected = readExpectedMigrationJournalTail();
    const applied = await readAppliedMigrationTail(sql);
    if (!applied) {
      return false;
    }
    if (Number(applied.createdAt) < expected.folderMillis) {
      return false;
    }
    if (applied.hash !== expected.hash) {
      return false;
    }
    return await hasTenantIsolationPrimitives(sql);
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
