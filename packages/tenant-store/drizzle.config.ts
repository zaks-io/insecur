import { defineConfig } from "drizzle-kit";

function migrationDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_MIGRATION?.trim() || process.env.DATABASE_URL?.trim();
  if (url) {
    return url;
  }

  // `generate` does not connect; `migrate` is always invoked from migrate.mjs after env is loaded.
  return "postgres://127.0.0.1:5432/postgres";
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: migrationDatabaseUrl(),
  },
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
});
