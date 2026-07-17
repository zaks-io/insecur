import {
  GITHUB_ACTIONS_PROVIDER_SCOPES,
  SECRET_SYNC_ERROR_CODES,
  SECRET_SYNC_KINDS,
  type GitHubActionsProviderScope,
  type OrganizationId,
  type SecretSyncBindingId,
  type SecretSyncId,
} from "@insecur/domain";

import {
  GITHUB_PROVIDER_CALL_RESULTS,
  type GitHubActionsDestinationRef,
  type GitHubActionsSecretsClient,
  type GitHubProviderCallResult,
} from "./github-actions-provider-client.js";
import { sealSecretForGitHub } from "./github-sealed-box.js";
import {
  PROVIDER_LOOKUP_STATUSES,
  type ProviderDestinationLookupRequest,
  type ProviderDestinationLookupResult,
  type SecretSyncProviderLookupPort,
} from "./provider-lookup-port.js";
import {
  PROVIDER_WRITE_STATUSES,
  type ProviderSecretWriteRequest,
  type ProviderSecretWriteResult,
  type SecretSyncProviderWritePort,
} from "./provider-sync-write-port.js";
import { SecretSyncError } from "./secret-sync-error.js";

/** GitHub Actions secret value cap (docs/cli-and-sync.md §Plan): 48 KB. */
export const GITHUB_ACTIONS_PROVIDER_VALUE_SIZE_LIMIT_BYTES = 48 * 1024;

/**
 * GitHub Actions secret name rules: alphanumeric plus underscore, no leading
 * digit, and the reserved `GITHUB_` prefix is rejected by the provider.
 */
const GITHUB_SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const GITHUB_SECRET_NAME_MAX_LENGTH = 200;

export function assertGitHubDestinationNameValid(destinationName: string): void {
  if (
    destinationName.length === 0 ||
    destinationName.length > GITHUB_SECRET_NAME_MAX_LENGTH ||
    !GITHUB_SECRET_NAME_PATTERN.test(destinationName) ||
    destinationName.toUpperCase().startsWith("GITHUB_")
  ) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "github destination secret name is not a valid github actions secret name",
    );
  }
}

/** Deterministic pre-write gate: name format plus the 48 KB provider value cap. */
function assertGitHubWritableDestination(check: {
  readonly destinationName: string;
  readonly valueByteLength: number;
}): void {
  assertGitHubDestinationNameValid(check.destinationName);
  if (check.valueByteLength > GITHUB_ACTIONS_PROVIDER_VALUE_SIZE_LIMIT_BYTES) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.providerValueTooLarge,
      "a bound value exceeds the github actions provider value size limit",
    );
  }
}

interface GitHubDestinationShape {
  readonly providerKind: string;
  readonly githubProviderScope: string | null;
  readonly targetRepoId: string | null;
  readonly targetGithubEnvironmentId: string | null;
  readonly organizationId: ProviderSecretWriteRequest["organizationId"];
  readonly appConnectionId: ProviderSecretWriteRequest["appConnectionId"];
}

function githubScopeOf(value: string | null): GitHubActionsProviderScope | null {
  return value === GITHUB_ACTIONS_PROVIDER_SCOPES.repository ||
    value === GITHUB_ACTIONS_PROVIDER_SCOPES.environment
    ? value
    : null;
}

function toDestinationRef(request: GitHubDestinationShape): GitHubActionsDestinationRef | null {
  if (request.providerKind !== SECRET_SYNC_KINDS.githubActions) {
    return null;
  }
  const scope = githubScopeOf(request.githubProviderScope);
  if (scope === null || request.targetRepoId === null || request.targetRepoId.length === 0) {
    return null;
  }
  const environmentTargetId =
    scope === GITHUB_ACTIONS_PROVIDER_SCOPES.environment ? request.targetGithubEnvironmentId : null;
  if (scope === GITHUB_ACTIONS_PROVIDER_SCOPES.environment && environmentTargetId === null) {
    return null;
  }
  return {
    organizationId: request.organizationId,
    appConnectionId: request.appConnectionId,
    githubProviderScope: scope,
    targetRepoId: request.targetRepoId,
    targetGithubEnvironmentId: environmentTargetId,
  };
}

const LOOKUP_STATUS_BY_CALL_RESULT = {
  [GITHUB_PROVIDER_CALL_RESULTS.ok]: PROVIDER_LOOKUP_STATUSES.found,
  [GITHUB_PROVIDER_CALL_RESULTS.notFound]: PROVIDER_LOOKUP_STATUSES.notFound,
  [GITHUB_PROVIDER_CALL_RESULTS.targetMissing]: PROVIDER_LOOKUP_STATUSES.targetMissing,
  [GITHUB_PROVIDER_CALL_RESULTS.permissionDenied]: PROVIDER_LOOKUP_STATUSES.permissionDenied,
  [GITHUB_PROVIDER_CALL_RESULTS.unavailable]: PROVIDER_LOOKUP_STATUSES.unavailable,
} as const satisfies Record<GitHubProviderCallResult, string>;

const WRITE_STATUS_BY_CALL_RESULT = {
  [GITHUB_PROVIDER_CALL_RESULTS.ok]: PROVIDER_WRITE_STATUSES.written,
  // A 404 on the secret PUT or public-key fetch means the configured repo or
  // GitHub Environment is gone; the secret PUT itself is create-or-update.
  [GITHUB_PROVIDER_CALL_RESULTS.notFound]: PROVIDER_WRITE_STATUSES.targetMissing,
  [GITHUB_PROVIDER_CALL_RESULTS.targetMissing]: PROVIDER_WRITE_STATUSES.targetMissing,
  [GITHUB_PROVIDER_CALL_RESULTS.permissionDenied]: PROVIDER_WRITE_STATUSES.permissionDenied,
  [GITHUB_PROVIDER_CALL_RESULTS.unavailable]: PROVIDER_WRITE_STATUSES.retryableUnavailable,
} as const satisfies Record<GitHubProviderCallResult, string>;

/**
 * Resolves one binding's provider-side destination name inside the caller's
 * authorized seam. The Runtime deploy implements this with the allowlisted
 * Sensitive Metadata decrypt (ADR-0071); tests use fakes. Lookup needs it
 * because Explicit Provider Lookup checks one exact configured name.
 */
export interface GitHubDestinationNameResolver {
  resolveDestinationName(input: {
    readonly organizationId: OrganizationId;
    readonly secretSyncId: SecretSyncId;
    readonly bindingId: SecretSyncBindingId;
  }): Promise<string>;
}

async function lookupExact(
  client: GitHubActionsSecretsClient,
  resolver: GitHubDestinationNameResolver,
  request: ProviderDestinationLookupRequest,
): Promise<ProviderDestinationLookupResult> {
  const destination = toDestinationRef(request);
  if (destination === null || request.hasWorkerScriptTarget) {
    return { status: PROVIDER_LOOKUP_STATUSES.boundaryMismatch };
  }
  const destinationName = await resolver.resolveDestinationName({
    organizationId: request.organizationId,
    secretSyncId: request.secretSyncId,
    bindingId: request.bindingId,
  });
  const ack = await client.lookupDestinationSecret({ destination, destinationName });
  return { status: LOOKUP_STATUS_BY_CALL_RESULT[ack.result] };
}

async function writeExact(
  client: GitHubActionsSecretsClient,
  request: ProviderSecretWriteRequest,
): Promise<ProviderSecretWriteResult> {
  const destination = toDestinationRef(request);
  if (destination === null) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "github actions sync target configuration is invalid",
    );
  }
  assertGitHubDestinationNameValid(request.destinationName);

  const publicKey = await client.getDestinationPublicKey(destination);
  if (publicKey.result !== GITHUB_PROVIDER_CALL_RESULTS.ok) {
    return { status: WRITE_STATUS_BY_CALL_RESULT[publicKey.result] };
  }

  const sealedValueBase64 = sealSecretForGitHub(
    publicKey.publicKeyBase64,
    request.value.unwrapUtf8(),
  );
  const ack = await client.putSealedDestinationSecret({
    destination,
    destinationName: request.destinationName,
    keyId: publicKey.keyId,
    sealedValueBase64,
  });
  return { status: WRITE_STATUS_BY_CALL_RESULT[ack.result] };
}

export interface GitHubActionsSyncAdapter {
  readonly lookupPort: SecretSyncProviderLookupPort;
  readonly writePort: SecretSyncProviderWritePort;
}

/**
 * GitHub Actions Secret Sync adapter (INS-78) behind the provider lookup and
 * write ports. It addresses only the exact destination named by one Secret
 * Sync Binding, uploads values solely through GitHub's public-key sealed-box
 * flow, and reports normalized metadata-only statuses. It never reads
 * provider secret values back and never lets provider-native failure detail
 * or Sensitive Values escape.
 */
export function createGitHubActionsSyncAdapter(input: {
  readonly client: GitHubActionsSecretsClient;
  readonly destinationNameResolver: GitHubDestinationNameResolver;
}): GitHubActionsSyncAdapter {
  return {
    lookupPort: {
      lookupExactDestination: (request) =>
        lookupExact(input.client, input.destinationNameResolver, request),
    },
    writePort: {
      assertWritableDestination: assertGitHubWritableDestination,
      writeExactDestination: (request) => writeExact(input.client, request),
    },
  };
}
