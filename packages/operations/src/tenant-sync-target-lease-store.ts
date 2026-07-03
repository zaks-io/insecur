import type { OperationId, OrganizationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { isIsoTimestampExpired } from "./operation-execution-deadline.js";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import {
  deleteSyncTargetLease,
  extendSyncTargetLeaseExpiry,
  selectActiveSyncTargetLeaseForOperation,
  selectSyncTargetLease,
  upsertClaimSyncTargetLease,
} from "./sync-target-lease-persistence.js";
import { toSyncTargetLeaseSnapshot } from "./sync-target-lease-row.js";
import {
  assertFencingToken,
  type FencingToken,
  type SyncTargetKey,
  validateSyncTargetKey,
} from "./sync-target-types.js";

function assertPositiveTtl(ttlSeconds: number): void {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "ttlSeconds must be a positive integer",
    );
  }
}

export class TenantSyncTargetLeaseStore {
  constructor(private readonly sql: TenantScopedSql) {}

  claimLease(input: {
    target: SyncTargetKey;
    operationId: OperationId;
    ttlSeconds: number;
  }): Promise<FencingToken> {
    validateSyncTargetKey(input.target);
    assertPositiveTtl(input.ttlSeconds);
    return upsertClaimSyncTargetLease(this.sql, input);
  }

  async renewLease(input: {
    target: SyncTargetKey;
    operationId: OperationId;
    fencingToken: FencingToken;
    ttlSeconds: number;
  }): Promise<FencingToken> {
    validateSyncTargetKey(input.target);
    assertFencingToken(input.fencingToken);
    assertPositiveTtl(input.ttlSeconds);

    const renewed = await extendSyncTargetLeaseExpiry(this.sql, input);
    if (renewed !== null) {
      return renewed;
    }
    await this.assertLeaseOwnership(input);
    return input.fencingToken;
  }

  async releaseLease(input: {
    target: SyncTargetKey;
    operationId: OperationId;
    fencingToken: FencingToken;
  }): Promise<void> {
    validateSyncTargetKey(input.target);
    assertFencingToken(input.fencingToken);

    const released = await deleteSyncTargetLease(this.sql, input);
    if (!released) {
      throw new OperationStoreError(
        OPERATION_ERROR_CODES.staleFencingToken,
        "sync target lease release rejected stale or missing fencing token",
      );
    }
  }

  async assertLeaseOwnership(input: {
    target: SyncTargetKey;
    operationId: OperationId;
    fencingToken: FencingToken;
  }): Promise<void> {
    validateSyncTargetKey(input.target);
    assertFencingToken(input.fencingToken);

    const row = await selectSyncTargetLease(this.sql, input.target);
    if (row === null) {
      throw new OperationStoreError(
        OPERATION_ERROR_CODES.leaseNotHeld,
        "no sync target lease exists for the target",
      );
    }

    const snapshot = toSyncTargetLeaseSnapshot(row);
    const isExpired = isIsoTimestampExpired(snapshot.expiresAt);
    if (
      snapshot.heldByOperationId !== input.operationId ||
      snapshot.fencingToken !== input.fencingToken ||
      isExpired
    ) {
      throw new OperationStoreError(
        OPERATION_ERROR_CODES.staleFencingToken,
        "sync target lease is not owned by the provided operation and fencing token",
      );
    }
  }

  async findActiveLeaseHeldByOperation(input: {
    organizationId: OrganizationId;
    operationId: OperationId;
  }): Promise<ReturnType<typeof toSyncTargetLeaseSnapshot> | null> {
    const row = await selectActiveSyncTargetLeaseForOperation(this.sql, input);
    return row === null ? null : toSyncTargetLeaseSnapshot(row);
  }
}
