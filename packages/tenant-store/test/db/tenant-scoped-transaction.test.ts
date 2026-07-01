import { beforeEach, describe, expect, it, vi } from "vitest";

const drizzleMock = vi.hoisted(() => vi.fn());
const PostgresJsSessionMock = vi.hoisted(() =>
  vi.fn(function PostgresJsSession(this: { client: unknown }, client: unknown) {
    this.client = client;
  }),
);
const PostgresJsTransactionMock = vi.hoisted(() =>
  vi.fn(function PostgresJsTransaction(
    this: { session: unknown },
    _dialect: unknown,
    session: unknown,
  ) {
    this.session = session;
  }),
);
const getRuntimeTenantDbMock = vi.hoisted(() =>
  vi.fn(() => ({
    dialect: { tag: "tenant-dialect" },
  })),
);

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: drizzleMock,
  PostgresJsSession: PostgresJsSessionMock,
  PostgresJsTransaction: PostgresJsTransactionMock,
}));

vi.mock("../../src/tenant-scoped-db.js", () => ({
  getRuntimeTenantDb: getRuntimeTenantDbMock,
}));

import { tenantStoreSchema } from "../../src/db/tenant-store-schema.js";
import { createTenantScopedTransaction } from "../../src/tenant-scoped-transaction.js";

describe("createTenantScopedTransaction", () => {
  beforeEach(() => {
    drizzleMock.mockClear();
    PostgresJsSessionMock.mockClear();
    PostgresJsTransactionMock.mockClear();
    getRuntimeTenantDbMock.mockClear();
  });

  it("builds a transaction Drizzle session from the supplied postgres.js client", () => {
    const sql = { tag: "tx-sql" };
    const handles = createTenantScopedTransaction(sql as never);

    expect(getRuntimeTenantDbMock).toHaveBeenCalledOnce();
    expect(PostgresJsSessionMock).toHaveBeenCalledWith(
      sql,
      { tag: "tenant-dialect" },
      expect.objectContaining({ fullSchema: tenantStoreSchema }),
    );
    expect(PostgresJsTransactionMock).toHaveBeenCalledWith(
      { tag: "tenant-dialect" },
      expect.objectContaining({ client: sql }),
      expect.objectContaining({ fullSchema: tenantStoreSchema }),
    );
    expect(handles.sql).toBe(sql);
    expect(handles.db).toBeInstanceOf(PostgresJsTransactionMock);
  });

  it("does not call drizzle() on the transaction client", () => {
    const sql = { tag: "tx-sql" };
    createTenantScopedTransaction(sql as never);
    expect(drizzleMock).not.toHaveBeenCalled();
  });

  it("returns the supplied sql handle without reading Drizzle session.client", () => {
    const sql = { tag: "tx-sql" };
    const { sql: scopedSql } = createTenantScopedTransaction(sql as never);

    expect(scopedSql).toBe(sql);
  });
});
