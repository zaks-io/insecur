import { beforeEach, describe, expect, it, vi } from "vitest";

const applyTenantScopeMock = vi.hoisted(() => vi.fn(async () => undefined));
const beginMock = vi.hoisted(() =>
  vi.fn(async (callback: (txSql: { tag: string }) => Promise<unknown>) => {
    return callback({ tag: "scoped-sql" });
  }),
);
const createTenantScopedTransactionMock = vi.hoisted(() =>
  vi.fn((sql: { tag: string }) => ({
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
    createTenantScopedTransactionMock.mockClear();
  });

  it("opens a postgres transaction, applies tenant scope, then invokes the callback", async () => {
    const org = "org_00000000000000000000000001";
    const result = await withTenantScope(
      { kind: "organization", organizationId: org as never },
      async ({ db, sql }) => {
        expect(db).toEqual(expect.objectContaining({ execute: expect.any(Function) }));
        expect(sql).toEqual({ tag: "scoped-sql" });
        return "ok";
      },
    );

    expect(beginMock).toHaveBeenCalledOnce();
    expect(createTenantScopedTransactionMock).toHaveBeenCalledWith({ tag: "scoped-sql" });
    expect(applyTenantScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ execute: expect.any(Function) }),
      {
        kind: "organization",
        organizationId: org,
      },
    );
    expect(result).toBe("ok");
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
