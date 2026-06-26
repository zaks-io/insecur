import type { TenantScopedSql } from "@insecur/tenant-store";

export type FakeSqlHandler = (query: string, values: readonly unknown[]) => unknown;

function buildQuery(strings: TemplateStringsArray, values: readonly unknown[]): string {
  return strings.reduce((query, part, index) => query + part + String(values[index] ?? ""), "");
}

/**
 * Minimal tagged-template SQL fake for DB-less operation-store unit tests.
 * Handlers match on normalized query substrings; keep handlers local to each test file.
 */
export function createFakeTenantSql(handler: FakeSqlHandler): TenantScopedSql {
  const fakeSql = async <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
    const query = buildQuery(strings, values);
    return handler(query, values) as T;
  };

  return Object.assign(fakeSql, {
    typed: <T>(value: T): T => value,
  }) as unknown as TenantScopedSql;
}

export function queryIncludes(query: string, ...needles: string[]): boolean {
  const normalized = query.replace(/\s+/g, " ").toLowerCase();
  return needles.every((needle) => normalized.includes(needle.toLowerCase()));
}
