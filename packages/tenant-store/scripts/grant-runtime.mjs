import postgres from "postgres";
import { normalizeDatabaseUrlEnv, unquoteEnvValue } from "./lib/env-local.mjs";

/**
 * Grant DML on tenant tables to the NOBYPASSRLS runtime role. Migrations create tables
 * as the migration role; default privileges from Docker init do not apply when only
 * migrate.mjs runs against Neon or other hosts.
 */
export function resolveRuntimeRole() {
  normalizeDatabaseUrlEnv();

  const fromEnv = process.env.INSECUR_POSTGRES_RUNTIME_ROLE?.trim();
  if (fromEnv) {
    return unquoteEnvValue(fromEnv);
  }

  const runtimeUrl = process.env.DATABASE_URL_RUNTIME?.trim();
  if (runtimeUrl) {
    return new URL(unquoteEnvValue(runtimeUrl)).username;
  }

  return null;
}

export async function grantRuntimeTablePrivileges(sql, runtimeRole) {
  const tables = await sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;

  for (const { tablename } of tables) {
    await sql.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${quoteIdentifier(tablename)} TO ${quoteIdentifier(runtimeRole)}`,
    );
  }

  const sequences = await sql`
    SELECT sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
    ORDER BY sequence_name
  `;

  for (const { sequence_name: sequenceName } of sequences) {
    await sql.unsafe(
      `GRANT USAGE, SELECT ON SEQUENCE public.${quoteIdentifier(sequenceName)} TO ${quoteIdentifier(runtimeRole)}`,
    );
  }

  await sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(runtimeRole)}`);
  await sql.unsafe(`GRANT USAGE ON SCHEMA app TO ${quoteIdentifier(runtimeRole)}`);
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}
