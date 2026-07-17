import type { PlaintextHandle } from "@insecur/crypto";
import {
  PROVIDER_ERROR_CODES,
  type AppConnectionId,
  type GitHubActionsProviderScope,
  type OrganizationId,
  type SecretSyncBindingId,
  type SecretSyncId,
  type SecretSyncKind,
} from "@insecur/domain";

import { SecretSyncError } from "./secret-sync-error.js";

/**
 * Normalized provider write outcomes (docs/cli-and-sync.md §Run). Stable
 * dotted codes so per-binding results are metadata-safe in operation progress
 * and audit details. Raw provider bodies, provider-native error text, and
 * Sensitive Values never cross this seam outward.
 */
export const PROVIDER_WRITE_STATUSES = {
  /** The exact bound destination now holds the synced value. */
  written: "provider_write.written",
  /** The connection credential lacks the scope to write this destination. */
  permissionDenied: "provider_write.permission_denied",
  /** The configured target resource (repo, environment) no longer exists. */
  targetMissing: "provider_write.target_missing",
  /** Transient provider failure; the same binding is safely retryable. */
  retryableUnavailable: "provider_write.retryable_unavailable",
} as const;

export type ProviderWriteStatus =
  (typeof PROVIDER_WRITE_STATUSES)[keyof typeof PROVIDER_WRITE_STATUSES];

const PROVIDER_WRITE_STATUS_SET = new Set<string>(Object.values(PROVIDER_WRITE_STATUSES));

export function isProviderWriteStatus(value: string): value is ProviderWriteStatus {
  return PROVIDER_WRITE_STATUS_SET.has(value);
}

/** Write failures that need a configuration or credential fix, not a retry. */
export function isActionRequiredWriteStatus(status: ProviderWriteStatus): boolean {
  return (
    status === PROVIDER_WRITE_STATUSES.permissionDenied ||
    status === PROVIDER_WRITE_STATUSES.targetMissing
  );
}

/**
 * One exact Secret Sync Binding write inside one App Connection boundary.
 * `destinationName` is decrypted Sensitive Metadata and `value` is the
 * decrypted Sensitive Value: both exist only inside the active request
 * execution after Sync Execution Revalidation, and neither may be logged,
 * persisted, audited, or echoed in errors by any adapter.
 */
export interface ProviderSecretWriteRequest {
  readonly providerKind: SecretSyncKind;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly secretSyncId: SecretSyncId;
  readonly bindingId: SecretSyncBindingId;
  readonly githubProviderScope: GitHubActionsProviderScope | null;
  readonly targetRepoId: string | null;
  readonly targetGithubEnvironmentId: string | null;
  readonly destinationName: string;
  readonly value: PlaintextHandle;
}

export interface ProviderSecretWriteResult {
  readonly status: ProviderWriteStatus;
}

/**
 * Metadata-only identity of one run's staged write set for the single-deploy
 * commit (ADR-0039/ADR-0057). Carries only opaque selectors; the adapter
 * resolves the exact provider destination inside its own authorized seam.
 */
export interface ProviderStagedCommitRequest {
  readonly providerKind: SecretSyncKind;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly secretSyncId: SecretSyncId;
}

/**
 * Provider sync write port. Adapters are provider-specific (GitHub Actions:
 * INS-78, Cloudflare Worker secrets: INS-79) and write exactly one bound
 * destination per call — no inventory, wildcard, or batch shapes exist on
 * this Interface by construction.
 */
export interface SecretSyncProviderWritePort {
  /**
   * Deterministic pre-write validation for one destination: provider-side
   * name format and the destination Provider Value Size Limit. The engine
   * calls this for every binding in the write set before the first provider
   * write (All-Or-Nothing Sync Pre-Write Gate); failures throw
   * `SecretSyncError` with `sync.invalid_destination` or
   * `sync.provider_value_too_large` and no binding is written.
   */
  assertWritableDestination(input: {
    readonly destinationName: string;
    readonly valueByteLength: number;
  }): void;
  writeExactDestination(request: ProviderSecretWriteRequest): Promise<ProviderSecretWriteResult>;
  /**
   * Single-deploy commit for providers whose secret writes are a production
   * deploy (ADR-0039/ADR-0057, Cloudflare Worker secrets): every
   * `writeExactDestination` call stages one binding into one new staged
   * provider version, and this call deploys that version exactly once. The
   * engine invokes it only after every binding staged successfully; a failed
   * commit means no binding landed and the deployed provider state is
   * untouched. Absent for per-binding providers (GitHub Actions), whose
   * writes commit individually.
   */
  commitStagedWrites?(request: ProviderStagedCommitRequest): Promise<ProviderSecretWriteResult>;
}

export type SecretSyncProviderWritePorts = Partial<
  Record<SecretSyncKind, SecretSyncProviderWritePort>
>;

export function resolveProviderWritePort(
  ports: SecretSyncProviderWritePorts,
  providerKind: SecretSyncKind,
): SecretSyncProviderWritePort {
  const port = ports[providerKind];
  if (port === undefined) {
    throw new SecretSyncError(
      PROVIDER_ERROR_CODES.unavailable,
      "no provider sync write adapter is configured for this sync kind",
    );
  }
  return port;
}

/**
 * Runs one exact-destination write and fails closed on adapter errors or
 * out-of-vocabulary statuses. An unclassifiable failure is reported as
 * retryable because provider secret PUTs are idempotent for the same binding,
 * and provider-native failure detail can never reach operation records or
 * audit events.
 */
export async function writeExactDestinationSafely(
  port: SecretSyncProviderWritePort,
  request: ProviderSecretWriteRequest,
): Promise<ProviderSecretWriteResult> {
  try {
    const result = await port.writeExactDestination(request);
    if (!isProviderWriteStatus(result.status)) {
      return { status: PROVIDER_WRITE_STATUSES.retryableUnavailable };
    }
    return { status: result.status };
  } catch {
    return { status: PROVIDER_WRITE_STATUSES.retryableUnavailable };
  }
}

/**
 * Runs the optional single-deploy commit and fails closed like
 * `writeExactDestinationSafely`. A port without a staged-commit seam commits
 * per write, so the staged set is already live and the commit is a no-op
 * `written`. Deploy commits are idempotent for the same staged version, so an
 * unclassifiable failure is reported as retryable.
 */
export async function commitStagedWritesSafely(
  port: SecretSyncProviderWritePort,
  request: ProviderStagedCommitRequest,
): Promise<ProviderSecretWriteResult> {
  if (port.commitStagedWrites === undefined) {
    return { status: PROVIDER_WRITE_STATUSES.written };
  }
  try {
    const result = await port.commitStagedWrites(request);
    if (!isProviderWriteStatus(result.status)) {
      return { status: PROVIDER_WRITE_STATUSES.retryableUnavailable };
    }
    return { status: result.status };
  } catch {
    return { status: PROVIDER_WRITE_STATUSES.retryableUnavailable };
  }
}
