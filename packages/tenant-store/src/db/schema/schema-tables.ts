import { getTableName, isTable } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/**
 * Schema modules whose `pgTable` exports participate in the unit-layer plaintext
 * metadata conformance surface. Every module that exports user tables must appear
 * here; `plaintext-metadata-conformance.test.ts` asserts full coverage.
 */
export const USER_SCHEMA_TABLE_MODULE_PATHS = [
  "./tenant-hierarchy.js",
  "./instance-bootstrap.js",
  "./tenant-collaboration.js",
  "./tenant-machine-auth-methods.js",
  "./tenant-agent-sessions.js",
  "./tenant-integrations.js",
  "./tenant-secrets.js",
  "./tenant-secret-syncs.js",
  "./tenant-webhooks.js",
  "./tenant-protected-changes.js",
  "./tenant-approval-requests.js",
] as const;

/**
 * Collects every Drizzle table export from a loaded schema module.
 * Dynamic imports keep pgTable constraint builders off the static module graph so their
 * function coverage is attributed during unit tests.
 */
export function collectPgTableExportsFromModule(
  moduleExports: Record<string, unknown>,
): readonly PgTable[] {
  const tables: PgTable[] = [];

  for (const exported of Object.values(moduleExports)) {
    if (isTable(exported)) {
      tables.push(exported as PgTable);
    }
  }

  return tables;
}

/**
 * Loads every `public` schema user table for conformance checks under active coverage.
 */
export async function loadUserSchemaTables(
  modulePaths: readonly string[] = USER_SCHEMA_TABLE_MODULE_PATHS,
): Promise<readonly PgTable[]> {
  const modules = await Promise.all(
    modulePaths.map((modulePath) => import(modulePath) as Promise<Record<string, unknown>>),
  );

  const tables = modules.flatMap((moduleExports) => collectPgTableExportsFromModule(moduleExports));

  return [...tables].sort((left, right) => getTableName(left).localeCompare(getTableName(right)));
}
