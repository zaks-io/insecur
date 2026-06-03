import { beforeEach, describe, expect, it, vi } from "vitest";

const applyTenantScopeMock = vi.hoisted(() => vi.fn(async () => undefined));
const transactionMock = vi.hoisted(() =>
  vi.fn(async (callback: (tx: { execute: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
    const tx = { execute: vi.fn() };
    return callback(tx);
  }),
);
const drizzleDbMock = vi.hoisted(() => ({
  transaction: transactionMock,
}));

vi.mock("../src/apply-tenant-scope.js", () => ({
  applyTenantScope: applyTenantScopeMock,
}));

vi.mock("../src/tenant-scoped-db.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/tenant-scoped-db.js")>();
  return {
    ...actual,
    getRuntimeTenantDb: vi.fn(() => drizzleDbMock),
    tenantScopedSql: vi.fn(() => ({ tag: "scoped-sql" })),
  };
});

import { organizationId } from "@insecur/domain";
import { withTenantScope } from "../src/with-tenant-scope.js";

describe("withTenantScope", () => {
  beforeEach(() => {
    applyTenantScopeMock.mockClear();
    transactionMock.mockClear();
  });

  it("applies tenant scope then invokes the callback on the drizzle transaction", async () => {
    const org = organizationId.brand("org_00000000000000000000000001");
    const result = await withTenantScope(
      { kind: "organization", organizationId: org },
      async ({ db, sql }) => {
        expect(db).toEqual(expect.objectContaining({ execute: expect.any(Function) }));
        expect(sql).toEqual({ tag: "scoped-sql" });
        return "ok";
      },
    );

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(applyTenantScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ execute: expect.any(Function) }),
      {
        kind: "organization",
        organizationId: org,
      },
    );
    expect(result).toBe("ok");
  });
});
