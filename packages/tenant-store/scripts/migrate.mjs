import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(packageRoot, "migrations");

const databaseUrl = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL_MIGRATION or DATABASE_URL is required");
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

  console.log("Migrations complete");
} finally {
  await sql.end({ timeout: 5 });
}
