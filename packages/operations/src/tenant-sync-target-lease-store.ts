import type { OperationId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import {
  deleteSyncTargetLease,
  extendSyncTargetLeaseExpiry,
  insertSyncTargetLease,
  selectSyncTargetLease,
  selectSyncTargetLeaseForUpdate,
  takeoverSyncTargetLease,
} from "./sync-target-lease-persistence.js";
import { toSyncTargetLeaseSnapshot } from "./sync-target-lease-row.js";
import {
  assertFencingToken,
  type FencingToken,
  type SyncTargetKey,
  validateSyncTargetKey,
} from "./sync-target-types.js";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

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

  async claimLease(input: {
    target: SyncTargetKey;
    operationId: OperationId;
    ttlSeconds: number;
  }): Promise<FencingToken> {
    validateSyncTargetKey(input.target);
    assertPositiveTtl(input.ttlSeconds);

    try {
      return await insertSyncTargetLease(this.sql, input);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }

    return await this.claimExistingLease(input);
  }

  private async claimExistingLease(input: {
    target: SyncTargetKey;
    operationId: OperationId;
    ttlSeconds: number;
  }): Promise<FencingToken> {
    const existing = await selectSyncTargetLeaseForUpdate(this.sql, input.target);
    if (existing === null) {
      return await insertSyncTargetLease(this.sql, input);
    }

    const snapshot = toSyncTargetLeaseSnapshot(existing);
    const isExpired = Date.parse(snapshot.expiresAt) <= Date.now();
    const sameHolder = snapshot.heldByOperationId === input.operationId;

    if (!isExpired && !sameHolder) {
      throw new OperationStoreError(
        OPERATION_ERROR_CODES.targetBusy,
        "sync target lease is held by another operation",
        true,
      );
    }

    if (!isExpired && sameHolder) {
      return await this.extendLease(input, snapshot.fencingToken);
    }

    const taken = await takeoverSyncTargetLease(this.sql, input);
    if (taken === null) {
      throw new OperationStoreError(
        OPERATION_ERROR_CODES.targetBusy,
        "sync target lease claim lost a concurrent race",
        true,
      );
    }
    return taken;
  }

  async renewLease(input: {
    target: SyncTargetKey;
    operationId: OperationId;
    fencingToken: FencingToken;
    ttlSeconds: number;
  }): Promise<FencingToken> {
    validateSyncTargetKey(input.target);
    assertFencingToken(input.fencingToken);
    return await this.extendLease(input, input.fencingToken);
  }

  private async extendLease(
    input: {
      target: SyncTargetKey;
      operationId: OperationId;
      ttlSeconds: number;
    },
    fencingToken: FencingToken,
  ): Promise<FencingToken> {
    assertPositiveTtl(input.ttlSeconds);
    const renewed = await extendSyncTargetLeaseExpiry(this.sql, {
      ...input,
      fencingToken,
    });
    if (renewed !== null) {
      return renewed;
    }
    await this.assertLeaseOwnership({
      target: input.target,
      operationId: input.operationId,
      fencingToken,
    });
    return fencingToken;
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
    const isExpired = Date.parse(snapshot.expiresAt) <= Date.now();
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
}
