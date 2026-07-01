import { describe, expect, it, vi } from "vitest";

const drizzleMock = vi.hoisted(() => vi.fn((sql: unknown) => ({ drizzleFor: sql })));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: drizzleMock,
}));

import { tenantStoreSchema } from "../../src/db/tenant-store-schema.js";
import { createTenantScopedTransaction } from "../../src/tenant-scoped-transaction.js";

describe("createTenantScopedTransaction", () => {
  it("builds Drizzle from the supplied postgres.js client and returns both handles", () => {
    const sql = { tag: "tx-sql" };
    const handles = createTenantScopedTransaction(sql as never);

    expect(drizzleMock).toHaveBeenCalledWith(sql, { schema: tenantStoreSchema });
    expect(handles.sql).toBe(sql);
    expect(handles.db).toEqual({ drizzleFor: sql });
  });

  it("does not derive sql from the Drizzle client", () => {
    const sql = { tag: "tx-sql" };
    const { db, sql: scopedSql } = createTenantScopedTransaction(sql as never);

    expect(scopedSql).toBe(sql);
    expect(db).not.toHaveProperty("session");
    expect((db as { session?: { client: unknown } }).session?.client).toBeUndefined();
  });
});
