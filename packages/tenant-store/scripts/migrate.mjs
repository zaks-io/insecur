import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { grantRuntimeTablePrivileges, resolveRuntimeRole } from "./grant-runtime.mjs";
import { loadRepoEnvLocal, redactLoggableError, requireDatabaseUrl } from "./lib/env-local.mjs";
import { TENANT_STORE_MIGRATION_LOCK_KEY } from "./lib/test-advisory-locks.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const legacyMigrationsDir = join(packageRoot, "migrations");
const rawPoliciesSqlPath = join(packageRoot, "sql", "policies-and-roles.sql");

loadRepoEnvLocal();

let databaseUrl;
try {
  databaseUrl = requireDatabaseUrl("DATABASE_URL_MIGRATION", "DATABASE_URL");
} catch (error) {
  console.error(redactLoggableError(error));
  process.exit(1);
}

const sql = postgres(databaseUrl, { prepare: false, max: 1 });

try {
  await sql`SELECT pg_advisory_lock(${TENANT_STORE_MIGRATION_LOCK_KEY})`;

  applyDrizzleBaseline();
  await applyRawPoliciesAndRoles(sql);
  await applyLegacySqlMigrations(sql);

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
    process.exit(result.status ?? 1);
  }
}

async function applyRawPoliciesAndRoles(sql) {
  const body = readFileSync(rawPoliciesSqlPath, "utf8");
  console.log("Applying raw policy and role SQL step");
  await sql.unsafe(body);
}

async function applyLegacySqlMigrations(sql) {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await sql`SELECT version FROM schema_migrations ORDER BY version`).map((row) => row.version),
  );

  const files = readdirSync(legacyMigrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) {
      continue;
    }

    const body = readFileSync(join(legacyMigrationsDir, file), "utf8");
    console.log(`Applying legacy migration ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
    });
  }
}
