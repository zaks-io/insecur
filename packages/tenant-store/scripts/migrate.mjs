import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { grantRuntimeTablePrivileges, resolveRuntimeRole } from "./grant-runtime.mjs";
import { loadRepoEnvLocal, redactLoggableError, requireDatabaseUrl } from "./lib/env-local.mjs";
import { isTenantStoreSchemaCurrent } from "./lib/migration-current.mjs";
import { TENANT_STORE_MIGRATION_LOCK_KEY } from "./lib/test-advisory-locks.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const rawPoliciesSqlPath = join(packageRoot, "sql", "policies-and-roles.sql");

loadRepoEnvLocal();

let databaseUrl;
try {
  databaseUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");
} catch (error) {
  console.error(redactLoggableError(error));
  process.exit(1);
}

if (await isTenantStoreSchemaCurrent(databaseUrl)) {
  console.log("Migrations already current; skipping migrate.mjs");
  process.exit(0);
}

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

try {
  await sql`SELECT pg_advisory_lock(${TENANT_STORE_MIGRATION_LOCK_KEY})`;

  applyDrizzleBaseline();
  await applyRawPoliciesAndRoles(sql);

  const runtimeRole = resolveRuntimeRole();
  if (runtimeRole) {
    console.log(`Granting runtime table privileges to ${runtimeRole}`);
    await grantRuntimeTablePrivileges(sql, runtimeRole);
  } else {
    console.warn(
      "Skipping runtime grants: set INSECUR_POSTGRES_RUNTIME_ROLE or DATABASE_URL_RUNTIME",
    );
  }

  console.log("Migrations complete");
} catch (error) {
  console.error(redactLoggableError(error));
  process.exit(1);
} finally {
  try {
    await sql`SELECT pg_advisory_unlock(${TENANT_STORE_MIGRATION_LOCK_KEY})`;
  } catch {
    // Best-effort unlock before closing the connection.
  }
  await sql.end({ timeout: 5 });
}

function applyDrizzleBaseline() {
  console.log("Applying Drizzle baseline migrations");
  const result = spawnSync(
    "pnpm",
    ["exec", "drizzle-kit", "migrate", "--config", "drizzle.config.ts"],
    {
      cwd: packageRoot,
      env: process.env,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    throw new Error(`drizzle-kit migrate failed with exit code ${result.status ?? 1}`);
  }
}

async function applyRawPoliciesAndRoles(sql) {
  const body = readFileSync(rawPoliciesSqlPath, "utf8");
  console.log("Applying raw policy and role SQL step");
  await sql.unsafe(body);
}
