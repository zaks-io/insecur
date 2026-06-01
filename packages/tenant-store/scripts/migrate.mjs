import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { grantRuntimeTablePrivileges, resolveRuntimeRole } from "./grant-runtime.mjs";
import { loadRepoEnvLocal, redactLoggableError, requireDatabaseUrl } from "./lib/env-local.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(packageRoot, "migrations");

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
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await sql`SELECT version FROM schema_migrations ORDER BY version`).map((row) => row.version),
  );

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) {
      continue;
    }

    const body = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
    });
  }

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
  await sql.end({ timeout: 5 });
}
