/**
 * PostgreSQL identifier helpers (INS-250).
 *
 * Postgres truncates identifiers longer than 63 bytes (NAMEDATALEN - 1). Drizzle's
 * default generated names for composite foreign keys often exceed that limit.
 */

export const PG_IDENTIFIER_MAX_LENGTH = 63;

export function pgIdentifier(name: string): string {
  if (name.length > PG_IDENTIFIER_MAX_LENGTH) {
    throw new Error(
      "PostgreSQL identifier exceeds " +
        String(PG_IDENTIFIER_MAX_LENGTH) +
        " chars (" +
        String(name.length) +
        "): " +
        name,
    );
  }
  return name;
}

export function orgProjectFkey(table: string): string {
  return pgIdentifier(`${table}_org_project_fkey`);
}

export function orgEnvironmentFkey(table: string): string {
  return pgIdentifier(`${table}_org_env_fkey`);
}

export function orgMachineIdentityFkey(table: string): string {
  return pgIdentifier(`${table}_org_machine_fkey`);
}

export function orgSubscriptionFkey(table: string): string {
  return pgIdentifier(`${table}_org_subscription_fkey`);
}
