import type { OperationId, OrganizationId, ProjectId } from "@insecur/domain";
import { OPERATION_ERROR_CODES, OperationStoreError } from "./operation-errors.js";
const TARGET_IDENTITY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_./:@-]*$/;

/** Provider sync target kinds from docs/cli-and-sync.md (metadata only). */
export const SYNC_PROVIDER_KINDS = [
  "github-actions",
  "cloudflare-worker-secret",
  "vercel-env",
] as const;

export type SyncProviderKind = (typeof SYNC_PROVIDER_KINDS)[number];

const SYNC_PROVIDER_KIND_SET = new Set<string>(SYNC_PROVIDER_KINDS);

/** Monotonic lease generation checked before provider writes and guarded transitions. */
export type FencingToken = number;

/** Exact sync target identity: tenant-qualified and project-scoped. */
export interface SyncTargetKey {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly providerKind: SyncProviderKind;
  /** Opaque provider target identity (repo, worker script, project id). Never secret values. */
  readonly targetIdentity: string;
}

export interface SyncTargetLeaseContext {
  readonly target: SyncTargetKey;
  readonly fencingToken: FencingToken;
}

const TARGET_IDENTITY_MAX_LENGTH = 512;

export function isSyncProviderKind(value: string): value is SyncProviderKind {
  return SYNC_PROVIDER_KIND_SET.has(value);
}

export function assertFencingToken(value: number): asserts value is FencingToken {
  if (!Number.isInteger(value) || value <= 0) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "fencingToken must be a positive integer",
    );
  }
}

export function validateSyncTargetKey(target: SyncTargetKey): void {
  if (!isSyncProviderKind(target.providerKind)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "providerKind must be a supported sync provider kind",
    );
  }
  const identity = target.targetIdentity;
  if (identity.length === 0 || identity.length > TARGET_IDENTITY_MAX_LENGTH) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "targetIdentity must be 1-512 non-empty characters",
    );
  }
  if (!TARGET_IDENTITY_PATTERN.test(identity)) {
    throw new OperationStoreError(
      OPERATION_ERROR_CODES.invalidMetadata,
      "targetIdentity must be an opaque provider target selector",
    );
  }
}

export function leaseTargetMatchesOperation(
  target: SyncTargetKey,
  input: { organizationId: OrganizationId; operationId: OperationId },
): boolean {
  return target.organizationId === input.organizationId;
}
