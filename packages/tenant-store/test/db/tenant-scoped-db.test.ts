import { beforeEach, describe, expect, it, vi } from "vitest";

const drizzleMock = vi.hoisted(() =>
  vi.fn(() => ({
    transaction: vi.fn(),
    query: {
      secrets: {},
      secretVersions: {},
    },
  })),
);

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: drizzleMock,
}));

const activeRuntimeConnectionMock = vi.hoisted(() => vi.fn(() => undefined));

vi.mock("../../src/db/connection.js", () => ({
  getRuntimeSql: vi.fn(() => ({ options: { parsers: {}, serializers: {} } })),
  activeRuntimeConnection: activeRuntimeConnectionMock,
}));

import { tenantStoreSchema } from "../../src/db/tenant-store-schema.js";
import { getRuntimeTenantDb, resetRuntimeTenantDb } from "../../src/tenant-scoped-db.js";

describe("tenantStoreSchema", () => {
  it("bundles tables used by the tenant-store query layer", () => {
    expect(Object.keys(tenantStoreSchema).sort()).toEqual(
      [
        "environments",
        "injectionGrants",
        "organizationDataKeys",
        "projectDataKeys",
        "providerCredentials",
        "secretVersions",
        "secrets",
        "sensitiveMetadataFields",
      ].sort(),
    );
  });
});

describe("getRuntimeTenantDb", () => {
  beforeEach(() => {
    drizzleMock.mockClear();
    activeRuntimeConnectionMock.mockReturnValue(undefined);
    resetRuntimeTenantDb();
  });

  it("constructs Drizzle from the fallback pool when no request connection is active", () => {
    const db = getRuntimeTenantDb();
    expect(drizzleMock).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.any(Object) }),
      {
        schema: tenantStoreSchema,
      },
    );
    expect(db.query.secrets).toBeDefined();
  });

  it("builds the Drizzle client over the active request connection and caches it there", () => {
    const sql = { options: { parsers: {} } };
    const connection: { sql: unknown; tenantDb?: unknown } = { sql };
    activeRuntimeConnectionMock.mockReturnValue(connection as never);

    const first = getRuntimeTenantDb();
    const second = getRuntimeTenantDb();

    expect(drizzleMock).toHaveBeenCalledOnce();
    expect(drizzleMock).toHaveBeenCalledWith(sql, { schema: tenantStoreSchema });
    expect(first).toBe(second);
    expect(connection.tenantDb).toBe(first);
  });
});
