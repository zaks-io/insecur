import { organizationId, operationId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { OPERATION_ERROR_CODES } from "../src/operation-errors.js";
import type { SyncTargetLeaseRow } from "../src/sync-target-lease-row.js";
import { TenantSyncTargetLeaseStore } from "../src/tenant-sync-target-lease-store.js";
import type { SyncTargetKey } from "../src/sync-target-types.js";
import { createFakeTenantSql, queryIncludes } from "./helpers/fake-tenant-sql.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const OTHER_OP = operationId.brand("op_00000000000000000000000002");
const PRJ = projectId.brand("prj_00000000000000000000000001");

function testTarget(): SyncTargetKey {
  return {
    organizationId: ORG,
    projectId: PRJ,
    providerKind: "github-actions",
    targetIdentity: "acme/widget",
  };
}

function leaseRow(overrides: Partial<SyncTargetLeaseRow> = {}): SyncTargetLeaseRow {
  return {
    org_id: ORG,
    project_id: PRJ,
    provider_kind: "github-actions",
    target_identity: "acme/widget",
    held_by_operation_id: OP,
    fencing_token: "3",
    expires_at: "2099-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("TenantSyncTargetLeaseStore", () => {
  it("rejects invalid ttlSeconds on claim", () => {
    const store = new TenantSyncTargetLeaseStore(createFakeTenantSql(() => []));

    expect(() =>
      store.claimLease({
        target: testTarget(),
        operationId: OP,
        ttlSeconds: 0,
      }),
    ).toThrow(
      expect.objectContaining({
        code: OPERATION_ERROR_CODES.invalidMetadata,
        message: "ttlSeconds must be a positive integer",
      }),
    );
  });

  it("rejects invalid target keys before persistence", () => {
    const store = new TenantSyncTargetLeaseStore(createFakeTenantSql(() => []));

    expect(() =>
      store.claimLease({
        target: {
          ...testTarget(),
          targetIdentity: "",
        },
        operationId: OP,
        ttlSeconds: 60,
      }),
    ).toThrow(
      expect.objectContaining({
        code: OPERATION_ERROR_CODES.invalidMetadata,
      }),
    );
  });

  it("returns a fencing token from a successful claim", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "insert into sync_target_leases", "returning fencing_token")) {
        return [{ fencing_token: "4" }];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    const token = await store.claimLease({
      target: testTarget(),
      operationId: OP,
      ttlSeconds: 120,
    });
    expect(token).toBe(4);
  });

  it("maps concurrent claim loss to sync.target_busy", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "insert into sync_target_leases")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    await expect(
      store.claimLease({
        target: testTarget(),
        operationId: OP,
        ttlSeconds: 120,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.targetBusy,
      retryable: true,
    });
  });

  it("rejects invalid fencing tokens on renew and release", async () => {
    const store = new TenantSyncTargetLeaseStore(createFakeTenantSql(() => []));

    await expect(
      store.renewLease({
        target: testTarget(),
        operationId: OP,
        fencingToken: 0,
        ttlSeconds: 60,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.invalidMetadata,
      message: "fencingToken must be a positive integer",
    });

    await expect(
      store.releaseLease({
        target: testTarget(),
        operationId: OP,
        fencingToken: -1,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.invalidMetadata,
    });
  });

  it("returns the renewed fencing token when extend succeeds", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "update sync_target_leases", "returning fencing_token")) {
        return [{ fencing_token: "5" }];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    const token = await store.renewLease({
      target: testTarget(),
      operationId: OP,
      fencingToken: 5,
      ttlSeconds: 120,
    });
    expect(token).toBe(5);
  });

  it("falls back to assertLeaseOwnership when renew update misses", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "update sync_target_leases", "returning fencing_token")) {
        return [];
      }
      if (queryIncludes(query, "from sync_target_leases", "limit 1")) {
        return [leaseRow({ fencing_token: "7" })];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    const token = await store.renewLease({
      target: testTarget(),
      operationId: OP,
      fencingToken: 7,
      ttlSeconds: 120,
    });
    expect(token).toBe(7);
  });

  it("maps release failures to stale fencing token errors", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "delete from sync_target_leases")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    await expect(
      store.releaseLease({
        target: testTarget(),
        operationId: OP,
        fencingToken: 3,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.staleFencingToken,
      message: "sync target lease release rejected stale or missing fencing token",
    });
  });

  it("assertLeaseOwnership rejects missing leases", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from sync_target_leases", "limit 1")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    await expect(
      store.assertLeaseOwnership({
        target: testTarget(),
        operationId: OP,
        fencingToken: 3,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.leaseNotHeld,
    });
  });

  it("assertLeaseOwnership rejects leases held by a different operation", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from sync_target_leases", "limit 1")) {
        return [
          leaseRow({
            held_by_operation_id: OTHER_OP,
            fencing_token: "3",
            expires_at: "2099-01-01T00:00:00.000Z",
          }),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    await expect(
      store.assertLeaseOwnership({
        target: testTarget(),
        operationId: OP,
        fencingToken: 3,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.staleFencingToken,
      message: "sync target lease is not owned by the provided operation and fencing token",
    });
  });

  it("assertLeaseOwnership rejects stale fencing tokens for the same operation", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from sync_target_leases", "limit 1")) {
        return [
          leaseRow({
            held_by_operation_id: OP,
            fencing_token: "9",
            expires_at: "2099-01-01T00:00:00.000Z",
          }),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    await expect(
      store.assertLeaseOwnership({
        target: testTarget(),
        operationId: OP,
        fencingToken: 3,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.staleFencingToken,
      message: "sync target lease is not owned by the provided operation and fencing token",
    });
  });

  it("assertLeaseOwnership rejects expired leases", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from sync_target_leases", "limit 1")) {
        return [
          leaseRow({
            held_by_operation_id: OP,
            fencing_token: "3",
            expires_at: "2000-01-01T00:00:00.000Z",
          }),
        ];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    await expect(
      store.assertLeaseOwnership({
        target: testTarget(),
        operationId: OP,
        fencingToken: 3,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.staleFencingToken,
      message: "sync target lease is not owned by the provided operation and fencing token",
    });
  });

  it("findActiveLeaseHeldByOperation returns null when no active lease exists", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
        return [];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    const snapshot = await store.findActiveLeaseHeldByOperation({
      organizationId: ORG,
      operationId: OP,
    });
    expect(snapshot).toBeNull();
  });

  it("findActiveLeaseHeldByOperation maps an active lease row", async () => {
    const sql = createFakeTenantSql((query) => {
      if (queryIncludes(query, "from sync_target_leases", "held_by_operation_id")) {
        return [leaseRow({ fencing_token: "11", expires_at: "2099-06-01T00:00:00.000Z" })];
      }
      throw new Error(`unexpected query: ${query}`);
    });
    const store = new TenantSyncTargetLeaseStore(sql);

    const snapshot = await store.findActiveLeaseHeldByOperation({
      organizationId: ORG,
      operationId: OP,
    });
    expect(snapshot).toEqual({
      target: testTarget(),
      heldByOperationId: OP,
      fencingToken: 11,
      expiresAt: "2099-06-01T00:00:00.000Z",
    });
  });
});
