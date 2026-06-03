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

vi.mock("../../src/db/connection.js", () => ({
  getRuntimeSql: vi.fn(() => ({ options: { parsers: {}, serializers: {} } })),
}));

import { tenantStoreSchema } from "../../src/db/tenant-store-schema.js";
import {
  getRuntimeTenantDb,
  resetRuntimeTenantDb,
  tenantScopedSql,
  type TenantScopedDb,
} from "../../src/tenant-scoped-db.js";

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
    resetRuntimeTenantDb();
  });

  it("constructs Drizzle from the runtime pool with the tenant-store schema", () => {
    const db = getRuntimeTenantDb();
    expect(drizzleMock).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.any(Object) }),
      {
        schema: tenantStoreSchema,
      },
    );
    expect(db.query.secrets).toBeDefined();
  });
});

describe("tenantScopedSql", () => {
  it("returns the postgres.js transaction client behind a Drizzle tx", () => {
    const client = { options: { parsers: {} } };
    const db = { session: { client } } as unknown as TenantScopedDb;
    expect(tenantScopedSql(db)).toBe(client);
  });
});
