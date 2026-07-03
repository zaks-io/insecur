import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { organizationId } from "@insecur/domain";
import { applyTenantScope } from "../src/apply-tenant-scope.js";
import type { TenantScopedDb } from "../src/tenant-scoped-db.js";

const dialect = new PgDialect();

function capturingDb() {
  const queries: { sql: string; params: unknown[] }[] = [];
  const execute = vi.fn(async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
    queries.push(dialect.sqlToQuery(query));
    return undefined;
  });
  return { db: { execute } as unknown as TenantScopedDb, execute, queries };
}

describe("applyTenantScope", () => {
  it("scopes to the org and clears the service flag, both transaction-local", async () => {
    const { db, execute, queries } = capturingDb();
    const org = organizationId.brand("org_00000000000000000000000001");

    await applyTenantScope(db, { kind: "organization", organizationId: org });

    expect(execute).toHaveBeenCalledTimes(2);

    const orgQuery = queries.find((q) => q.sql.includes("app.current_org"));
    const serviceQuery = queries.find((q) => q.sql.includes("app.service"));

    // The org id is a bound parameter, never interpolated into SQL text (injection guard).
    expect(orgQuery?.sql).not.toContain(org);
    expect(orgQuery?.params).toEqual([org]);
    // is_local=true on every set_config so scope dies with the transaction (pooling-safe).
    for (const q of queries) {
      expect(q.sql).toMatch(/set_config\([^)]+,\s*true\)/);
    }
    // Org scope must positively DISABLE the service bypass, not leave it set.
    expect(serviceQuery?.sql).toContain("set_config('app.service', '', true)");
  });

  it("enables the service flag and clears org scope, both transaction-local", async () => {
    const { db, execute, queries } = capturingDb();

    await applyTenantScope(db, { kind: "service" });

    expect(execute).toHaveBeenCalledTimes(2);
    const serviceQuery = queries.find((q) => q.sql.includes("app.service"));
    const orgQuery = queries.find((q) => q.sql.includes("app.current_org"));

    expect(serviceQuery?.sql).toContain("set_config('app.service', 'true', true)");
    // Service scope clears any org value so a stale org id can't linger.
    expect(orgQuery?.sql).toContain("set_config('app.current_org', '', true)");
    for (const q of queries) {
      expect(q.sql).toMatch(/set_config\([^)]+,\s*true\)/);
    }
  });
});
