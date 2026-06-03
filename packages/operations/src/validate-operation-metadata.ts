import {
  assertMetadataOnlyValue,
  isStableDottedCode,
  MetadataEnvelopeValidationError,
  type AuditEventId,
  type KnownErrorCode,
} from "@insecur/domain";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
import type { OperationProgress, OperationProgressInput } from "./operation-types.js";
import {
  assertFencingToken,
  isSyncProviderKind,
  validateSyncTargetKey,
} from "./sync-target-types.js";
import type { SyncTargetKey } from "./sync-target-types.js";
function assertKnownErrorCode(value: string, field: string): asserts value is KnownErrorCode {
  if (!isStableDottedCode(value)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      `${field} must be a stable dotted code`,
    );
  }
}

function assertIsoTimestamp(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      `${field} must be an ISO-8601 timestamp`,
    );
  }
}

function assertAuditEventIds(ids: readonly AuditEventId[]): void {
  for (const id of ids) {
    if (typeof id !== "string" || !id.startsWith("aud_")) {
      throw new OperationStoreError(
        OPERATION_ERROR_CODES.invalidMetadata,
        "auditEventIds must contain audit event opaque IDs",
      );
    }
  }
}

function assertCounters(counters: Readonly<Record<string, number>>): void {
  for (const [key, value] of Object.entries(counters)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new OperationStoreError(
        OPERATION_ERROR_CODES.invalidMetadata,
        `counters.${key} must be a non-negative integer`,
      );
    }
  }
}

function assertMetadataOnlyProgress(progress: OperationProgress): void {
  try {
    assertMetadataOnlyValue(progress);
  } catch (error) {
    if (error instanceof MetadataEnvelopeValidationError) {
      throw new OperationStoreError(OPERATION_ERROR_CODES.invalidMetadata, error.message);
    }
    throw error;
  }
}

function assertWaitMetadata(wait: OperationProgress["wait"]): void {
  if (wait === undefined) {
    return;
  }
  assertKnownErrorCode(wait.reasonCode, "wait.reasonCode");
  if (wait.until !== undefined) {
    assertIsoTimestamp(wait.until, "wait.until");
  }
}

function assertRetryMetadata(retry: OperationProgress["retry"]): void {
  if (retry === undefined) {
    return;
  }
  if (!Number.isInteger(retry.attempt) || retry.attempt < 0) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "retry.attempt must be a non-negative integer",
    );
  }
  if (retry.reasonCode !== undefined) {
    assertKnownErrorCode(retry.reasonCode, "retry.reasonCode");
  }
  if (retry.nextRetryAt !== undefined) {
    assertIsoTimestamp(retry.nextRetryAt, "retry.nextRetryAt");
  }
}

function assertSyncTargetLeaseProgress(
  lease: NonNullable<OperationProgress["syncTargetLease"]>,
  organizationId?: SyncTargetKey["organizationId"],
): void {
  assertFencingToken(lease.fencingToken);
  if (organizationId !== undefined) {
    validateSyncTargetKey({
      organizationId,
      projectId: lease.projectId,
      providerKind: lease.providerKind,
      targetIdentity: lease.targetIdentity,
    });
    return;
  }
  if (!isSyncProviderKind(lease.providerKind)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "syncTargetLease.providerKind must be a supported sync provider kind",
    );
  }
}

function assertMutationIdempotencyKey(key: string): void {
  if (key.length === 0 || key.length > 256) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "mutationIdempotencyKey must be 1-256 characters",
    );
  }
}

function assertCallerProgressInput(progress: OperationProgressInput): void {
  if ("syncTargetLease" in (progress as Record<string, unknown>)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "syncTargetLease is owned by sync target lease claim and release APIs",
    );
  }
}

/**
 * Validates caller-supplied progress patches. Rejects syncTargetLease injection.
 */
export function validateOperationProgressInput(
  progress: OperationProgressInput,
  organizationId?: SyncTargetKey["organizationId"],
): void {
  assertCallerProgressInput(progress);
  validateOperationProgress(progress, organizationId);
}

/**
 * Rejects secret-bearing or free-form operation metadata before persistence or polling.
 */
export function validateOperationProgress(
  progress: OperationProgress,
  organizationId?: SyncTargetKey["organizationId"],
): void {
  assertMetadataOnlyProgress(progress);

  if (progress.syncTargetLease !== undefined) {
    assertSyncTargetLeaseProgress(progress.syncTargetLease, organizationId);
  }
  if (progress.auditEventIds !== undefined) {
    assertAuditEventIds(progress.auditEventIds);
  }
  assertWaitMetadata(progress.wait);
  assertRetryMetadata(progress.retry);
  if (progress.counters !== undefined) {
    assertCounters(progress.counters);
  }
  if (progress.providerStatusCode !== undefined) {
    assertKnownErrorCode(progress.providerStatusCode, "providerStatusCode");
  }
  if (progress.resultCode !== undefined) {
    assertKnownErrorCode(progress.resultCode, "resultCode");
  }
  if (progress.mutationIdempotencyKey !== undefined) {
    assertMutationIdempotencyKey(progress.mutationIdempotencyKey);
  }
}

export function validateOperationIntentCode(intentCode: string): void {
  if (!isStableDottedCode(intentCode)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidIntent,
      "intentCode must be a stable dotted code (e.g. sync.run)",
    );
  }
}
