import { beforeEach, describe, expect, it, vi } from "vitest";

const applyTenantScopeMock = vi.hoisted(() => vi.fn(async () => undefined));
const { beginMock, transactionSql } = vi.hoisted(() => {
  const transactionSql = { tag: "scoped-sql", unsafe: vi.fn() };
  const beginMock = vi.fn(async (...args: unknown[]) => {
    const callback = args.find((argument) => typeof argument === "function");
    if (typeof callback !== "function") {
      throw new Error("transaction callback is required");
    }
    return callback(transactionSql);
  });
  return { beginMock, transactionSql };
});
const createTenantScopedTransactionMock = vi.hoisted(() =>
  vi.fn((sql: { tag: string; unsafe: unknown }) => ({
    db: { execute: vi.fn(), fromSql: sql },
    sql,
  })),
);

vi.mock("../src/apply-tenant-scope.js", () => ({
  applyTenantScope: applyTenantScopeMock,
}));

vi.mock("../src/db/connection.js", () => ({
  getRuntimeSql: vi.fn(() => ({ begin: beginMock })),
}));

vi.mock("../src/tenant-scoped-transaction.js", () => ({
  createTenantScopedTransaction: createTenantScopedTransactionMock,
}));

import { withTenantScope } from "../src/with-tenant-scope.js";

describe("withTenantScope", () => {
  beforeEach(() => {
    applyTenantScopeMock.mockClear();
    beginMock.mockClear();
    transactionSql.unsafe.mockClear();
    createTenantScopedTransactionMock.mockClear();
  });

  it("opens a postgres transaction, applies tenant scope, then invokes the callback", async () => {
    const org = "org_00000000000000000000000001";
    const result = await withTenantScope(
      { kind: "organization", organizationId: org as never },
      async ({ db, sql }) => {
        expect(db).toEqual(expect.objectContaining({ execute: expect.any(Function) }));
        expect(sql).toEqual(expect.objectContaining({ tag: "scoped-sql" }));
        return "ok";
      },
    );

    expect(beginMock).toHaveBeenCalledOnce();
    expect(createTenantScopedTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "scoped-sql" }),
    );
    expect(applyTenantScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ execute: expect.any(Function) }),
      {
        kind: "organization",
        organizationId: org,
      },
    );
    expect(result).toBe("ok");
  });

  it("uses an opt-in read-only repeatable-read transaction and captures its first timestamp", async () => {
    transactionSql.unsafe.mockResolvedValueOnce([{ snapshot_at: "2026-07-09 12:34:56.789+00" }]);

    const result = await withTenantScope(
      { kind: "service" },
      async ({ snapshotAt }) => snapshotAt,
      {
        isolationLevel: "repeatable read",
        readOnly: true,
        captureSnapshotAt: true,
      },
    );

    expect(beginMock).toHaveBeenCalledWith(
      "isolation level repeatable read read only",
      expect.any(Function),
    );
    expect(transactionSql.unsafe).toHaveBeenCalledWith(
      "SELECT transaction_timestamp()::text AS snapshot_at",
    );
    expect(transactionSql.unsafe.mock.invocationCallOrder[0]).toBeLessThan(
      applyTenantScopeMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
    expect(result).toBe("2026-07-09T12:34:56.789Z");
  });

  it("fails closed when the transaction adapter is not supplied", async () => {
    createTenantScopedTransactionMock.mockImplementationOnce(() => {
      throw new Error("tenant-scoped transaction adapter is required");
    });

    await expect(withTenantScope({ kind: "service" }, async () => "unused")).rejects.toThrow(
      "tenant-scoped transaction adapter is required",
    );
  });
});
