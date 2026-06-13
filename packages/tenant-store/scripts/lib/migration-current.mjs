import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { resolveRuntimeRole } from "../grant-runtime.mjs";

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const policiesSqlPath = join(packageRoot, "sql", "policies-and-roles.sql");

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

/**
 * Expected tenant policies and RLS tables from sql/policies-and-roles.sql.
 * Parsed from the repo file so the seed gate tracks the same source migrate.mjs applies.
 */
export function readExpectedPoliciesAndRolesSpec() {
  const body = readFileSync(policiesSqlPath, "utf8");
  const policiesSqlHash = createHash("sha256").update(body).digest("hex");
  const policies = [];
  const policyPattern = /CREATE POLICY (\w+) ON (\w+)/g;
  let match = policyPattern.exec(body);
  while (match !== null) {
    policies.push({ policyname: match[1], tablename: match[2] });
    match = policyPattern.exec(body);
  }
  if (policies.length === 0) {
    throw new Error("policies-and-roles.sql has no CREATE POLICY statements");
  }
  const tenantTables = [...new Set(policies.map((policy) => policy.tablename))].sort();
  return { policiesSqlHash, policies, tenantTables };
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

async function hasPoliciesAndRolesApplied(sql) {
  const expected = readExpectedPoliciesAndRolesSpec();

  const [functionRow] = await sql`
    SELECT 1 AS ok
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'tenant_visible'
    LIMIT 1
  `;
  if (!functionRow) {
    return false;
  }

  const appliedPolicies = await sql`
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  `;
  const appliedPolicyKeys = new Set(
    appliedPolicies.map((policy) => `${policy.policyname}:${policy.tablename}`),
  );
  for (const { policyname, tablename } of expected.policies) {
    if (!appliedPolicyKeys.has(`${policyname}:${tablename}`)) {
      return false;
    }
  }

  const rlsRows = await sql`
    SELECT c.relname AS "tableName",
           c.relrowsecurity AS "rowSecurity",
           c.relforcerowsecurity AS "forceRowSecurity"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY(${expected.tenantTables})
  `;
  const rlsByTable = new Map(rlsRows.map((row) => [row.tableName, row]));
  for (const tableName of expected.tenantTables) {
    const row = rlsByTable.get(tableName);
    if (!row?.rowSecurity || !row?.forceRowSecurity) {
      return false;
    }
  }

  return true;
}

async function hasRuntimeTablePrivileges(sql, runtimeRole) {
  const tables = await sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  for (const { tablename } of tables) {
    const qualifiedTable = `public.${tablename}`;
    const [tablePrivilege] = await sql`
      SELECT has_table_privilege(
        ${runtimeRole},
        ${qualifiedTable},
        'SELECT, INSERT, UPDATE, DELETE'
      ) AS ok
    `;
    if (!tablePrivilege?.ok) {
      return false;
    }
  }

  const sequences = await sql`
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
    ORDER BY sequence_name
  `;
  for (const { sequence_name: sequenceName } of sequences) {
    const qualifiedSequence = `public.${sequenceName}`;
    const [sequencePrivilege] = await sql`
      SELECT has_sequence_privilege(
        ${runtimeRole},
        ${qualifiedSequence},
        'USAGE, SELECT'
      ) AS ok
    `;
    if (!sequencePrivilege?.ok) {
      return false;
    }
  }

  const [publicSchemaPrivilege] = await sql`
    SELECT has_schema_privilege(${runtimeRole}, 'public', 'USAGE') AS ok
  `;
  const [appSchemaPrivilege] = await sql`
    SELECT has_schema_privilege(${runtimeRole}, 'app', 'USAGE') AS ok
  `;
  const [functionPrivilege] = await sql`
    SELECT has_function_privilege(${runtimeRole}, 'app.tenant_visible(text)', 'EXECUTE') AS ok
  `;
  return Boolean(
    publicSchemaPrivilege?.ok && appSchemaPrivilege?.ok && functionPrivilege?.ok,
  );
}

/**
 * True when Drizzle migrations, tenant policies/RLS, and runtime grants (when configured)
 * match the repo head. Lets parallel test seeds skip migrate.mjs when dev:db:reset (or CI)
 * already applied schema. migrate.mjs remains the unconditional guarantee when this returns false.
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
    if (!(await hasPoliciesAndRolesApplied(sql))) {
      return false;
    }
    const runtimeRole = resolveRuntimeRole();
    if (runtimeRole && !(await hasRuntimeTablePrivileges(sql, runtimeRole))) {
      return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
