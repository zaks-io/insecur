import { beforeEach, describe, expect, it, vi } from "vitest";

const drizzleMock = vi.hoisted(() =>
  vi.fn(() => ({
    query: {
      secrets: {},
      secretVersions: {},
    },
  })),
);

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: drizzleMock,
}));

import { tenantStoreSchema } from "../../src/db/tenant-store-schema.js";
import { createTenantScopedDb } from "../../src/tenant-scoped-db.js";
import type { TenantScopedSql } from "../../src/tenant-scoped-sql.js";

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

describe("createTenantScopedDb", () => {
  beforeEach(() => {
    drizzleMock.mockClear();
  });

  it("wraps the transaction postgres handle with the tenant-store schema", () => {
    const sql = { options: { parsers: {} } } as unknown as TenantScopedSql;
    const db = createTenantScopedDb(sql);
    expect(drizzleMock).toHaveBeenCalledWith(sql, { schema: tenantStoreSchema });
    expect(db.query.secrets).toBeDefined();
  });
});
