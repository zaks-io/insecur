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
 * Normalized Explicit Provider Lookup statuses (docs/cli-and-sync.md §Verify).
 * Values are stable dotted codes so they are metadata-safe in audit details,
 * operation progress, and plan output. Raw provider bodies, provider-native
 * error text, and provider-side names never cross this seam.
 */
export const PROVIDER_LOOKUP_STATUSES = {
  /** The exact configured destination already exists in the provider. */
  found: "provider_lookup.found",
  /** The target resource exists but the exact destination does not (a write would create it). */
  notFound: "provider_lookup.not_found",
  /** The configured target resource (repo, environment, Worker script) no longer exists. */
  targetMissing: "provider_lookup.target_missing",
  /** The connection credential lacks the scope to read destination metadata. */
  permissionDenied: "provider_lookup.permission_denied",
  /** The configured destination falls outside the pinned Connection Boundary. */
  boundaryMismatch: "provider_lookup.boundary_mismatch",
  /** The provider could not be reached or returned an unclassifiable response. */
  unavailable: "provider_lookup.unavailable",
} as const;

export type ProviderLookupStatus =
  (typeof PROVIDER_LOOKUP_STATUSES)[keyof typeof PROVIDER_LOOKUP_STATUSES];

const PROVIDER_LOOKUP_STATUS_SET = new Set<string>(Object.values(PROVIDER_LOOKUP_STATUSES));

export function isProviderLookupStatus(value: string): value is ProviderLookupStatus {
  return PROVIDER_LOOKUP_STATUS_SET.has(value);
}

/** Metadata-only existence of the exact configured destination. */
export const PROVIDER_TARGET_EXISTENCE = {
  exists: "provider_target.exists",
  missing: "provider_target.missing",
  unknown: "provider_target.unknown",
} as const;

export type ProviderTargetExistence =
  (typeof PROVIDER_TARGET_EXISTENCE)[keyof typeof PROVIDER_TARGET_EXISTENCE];

/** Metadata-only permission classification for the lookup credential. */
export const PROVIDER_PERMISSION_STATUSES = {
  granted: "provider_permission.granted",
  denied: "provider_permission.denied",
  unknown: "provider_permission.unknown",
} as const;

export type ProviderPermissionStatus =
  (typeof PROVIDER_PERMISSION_STATUSES)[keyof typeof PROVIDER_PERMISSION_STATUSES];

export function toProviderTargetExistence(status: ProviderLookupStatus): ProviderTargetExistence {
  if (status === PROVIDER_LOOKUP_STATUSES.found) {
    return PROVIDER_TARGET_EXISTENCE.exists;
  }
  if (status === PROVIDER_LOOKUP_STATUSES.notFound) {
    return PROVIDER_TARGET_EXISTENCE.missing;
  }
  return PROVIDER_TARGET_EXISTENCE.unknown;
}

export function toProviderPermissionStatus(status: ProviderLookupStatus): ProviderPermissionStatus {
  if (status === PROVIDER_LOOKUP_STATUSES.permissionDenied) {
    return PROVIDER_PERMISSION_STATUSES.denied;
  }
  if (
    status === PROVIDER_LOOKUP_STATUSES.found ||
    status === PROVIDER_LOOKUP_STATUSES.notFound ||
    status === PROVIDER_LOOKUP_STATUSES.targetMissing
  ) {
    return PROVIDER_PERMISSION_STATUSES.granted;
  }
  return PROVIDER_PERMISSION_STATUSES.unknown;
}

/** A destination that already exists gets a Provider Overwrite Warning without Provider Readback. */
export function hasProviderOverwriteWarning(status: ProviderLookupStatus): boolean {
  return status === PROVIDER_LOOKUP_STATUSES.found;
}

/**
 * One exact Secret Sync Binding destination inside one App Connection boundary.
 * The request carries only opaque selectors; adapters resolve encrypted
 * destination names within their own authorized seam. No wildcard, prefix,
 * pattern, or list requests exist on this Interface by construction.
 */
export interface ProviderDestinationLookupRequest {
  readonly providerKind: SecretSyncKind;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly secretSyncId: SecretSyncId;
  readonly bindingId: SecretSyncBindingId;
  readonly githubProviderScope: GitHubActionsProviderScope | null;
  readonly targetRepoId: string | null;
  readonly targetGithubEnvironmentId: string | null;
  readonly hasWorkerScriptTarget: boolean;
}

export interface ProviderDestinationLookupResult {
  readonly status: ProviderLookupStatus;
}

/**
 * Explicit Provider Lookup port. Real adapters are provider-specific
 * (GitHub Actions: INS-78, Cloudflare Worker secrets: INS-79) and must be
 * metadata-only: existence and permission classification, never secret values,
 * provider inventory, or raw provider responses.
 */
export interface SecretSyncProviderLookupPort {
  lookupExactDestination(
    request: ProviderDestinationLookupRequest,
  ): Promise<ProviderDestinationLookupResult>;
}

export type SecretSyncProviderLookupPorts = Partial<
  Record<SecretSyncKind, SecretSyncProviderLookupPort>
>;

export function resolveProviderLookupPort(
  ports: SecretSyncProviderLookupPorts,
  providerKind: SecretSyncKind,
): SecretSyncProviderLookupPort {
  const port = ports[providerKind];
  if (port === undefined) {
    throw new SecretSyncError(
      PROVIDER_ERROR_CODES.unavailable,
      "no provider lookup adapter is configured for this sync kind",
    );
  }
  return port;
}

/**
 * Runs one lookup and fails closed to `unavailable` on adapter errors or
 * out-of-vocabulary statuses, so provider-native failure detail can never
 * reach plan output, audit events, or operation records.
 */
export async function lookupExactDestinationSafely(
  port: SecretSyncProviderLookupPort,
  request: ProviderDestinationLookupRequest,
): Promise<ProviderDestinationLookupResult> {
  try {
    const result = await port.lookupExactDestination(request);
    if (!isProviderLookupStatus(result.status)) {
      return { status: PROVIDER_LOOKUP_STATUSES.unavailable };
    }
    return { status: result.status };
  } catch {
    return { status: PROVIDER_LOOKUP_STATUSES.unavailable };
  }
}
