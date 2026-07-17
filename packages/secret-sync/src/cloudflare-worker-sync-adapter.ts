import {
  SECRET_SYNC_ERROR_CODES,
  SECRET_SYNC_KINDS,
  type OrganizationId,
  type SecretSyncId,
} from "@insecur/domain";

import {
  CLOUDFLARE_PROVIDER_CALL_RESULTS,
  type CloudflareProviderCallResult,
  type CloudflareWorkerDestinationRef,
  type CloudflareWorkerSecretsClient,
} from "./cloudflare-worker-provider-client.js";
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
  type ProviderStagedCommitRequest,
  type SecretSyncProviderWritePort,
} from "./provider-sync-write-port.js";
import { SecretSyncError } from "./secret-sync-error.js";
import type { SecretSyncDestinationNameResolver } from "./secret-sync-write-materials.js";

/** Cloudflare Worker variable/secret value cap (docs/cli-and-sync.md §Plan): 5 KB. */
export const CLOUDFLARE_WORKER_PROVIDER_VALUE_SIZE_LIMIT_BYTES = 5 * 1024;

/**
 * Cloudflare Worker secret binding names surface as JavaScript environment
 * bindings (`env.DATABASE_URL`), so the exact destination name must be a
 * plain identifier: alphanumeric plus underscore with no leading digit.
 */
const CLOUDFLARE_SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CLOUDFLARE_SECRET_NAME_MAX_LENGTH = 255;

export function assertCloudflareDestinationNameValid(destinationName: string): void {
  if (
    destinationName.length === 0 ||
    destinationName.length > CLOUDFLARE_SECRET_NAME_MAX_LENGTH ||
    !CLOUDFLARE_SECRET_NAME_PATTERN.test(destinationName)
  ) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "cloudflare destination secret name is not a valid worker secret binding name",
    );
  }
}

/** Deterministic pre-write gate: binding-name format plus the 5 KB provider value cap. */
function assertCloudflareWritableDestination(check: {
  readonly destinationName: string;
  readonly valueByteLength: number;
}): void {
  assertCloudflareDestinationNameValid(check.destinationName);
  if (check.valueByteLength > CLOUDFLARE_WORKER_PROVIDER_VALUE_SIZE_LIMIT_BYTES) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.providerValueTooLarge,
      "a bound value exceeds the cloudflare worker provider value size limit",
    );
  }
}

const LOOKUP_STATUS_BY_CALL_RESULT = {
  [CLOUDFLARE_PROVIDER_CALL_RESULTS.ok]: PROVIDER_LOOKUP_STATUSES.found,
  [CLOUDFLARE_PROVIDER_CALL_RESULTS.notFound]: PROVIDER_LOOKUP_STATUSES.notFound,
  [CLOUDFLARE_PROVIDER_CALL_RESULTS.targetMissing]: PROVIDER_LOOKUP_STATUSES.targetMissing,
  [CLOUDFLARE_PROVIDER_CALL_RESULTS.permissionDenied]: PROVIDER_LOOKUP_STATUSES.permissionDenied,
  [CLOUDFLARE_PROVIDER_CALL_RESULTS.unavailable]: PROVIDER_LOOKUP_STATUSES.unavailable,
} as const satisfies Record<CloudflareProviderCallResult, string>;

const WRITE_STATUS_BY_CALL_RESULT = {
  [CLOUDFLARE_PROVIDER_CALL_RESULTS.ok]: PROVIDER_WRITE_STATUSES.written,
  // A 404 while staging or deploying means the configured Worker script is
  // gone; the staged secret binding itself is create-or-update.
  [CLOUDFLARE_PROVIDER_CALL_RESULTS.notFound]: PROVIDER_WRITE_STATUSES.targetMissing,
  [CLOUDFLARE_PROVIDER_CALL_RESULTS.targetMissing]: PROVIDER_WRITE_STATUSES.targetMissing,
  [CLOUDFLARE_PROVIDER_CALL_RESULTS.permissionDenied]: PROVIDER_WRITE_STATUSES.permissionDenied,
  [CLOUDFLARE_PROVIDER_CALL_RESULTS.unavailable]: PROVIDER_WRITE_STATUSES.retryableUnavailable,
} as const satisfies Record<CloudflareProviderCallResult, string>;

/**
 * Resolves the sync's exact Worker script target name inside the caller's
 * authorized seam. The Runtime deploy implements this with the allowlisted
 * Sensitive Metadata decrypt (ADR-0071); tests use fakes. The resolved name
 * goes only into the exact provider request.
 */
export interface CloudflareWorkerScriptNameResolver {
  resolveWorkerScriptName(input: {
    readonly organizationId: OrganizationId;
    readonly secretSyncId: SecretSyncId;
  }): Promise<string>;
}

type CloudflareRequestScope = Pick<
  ProviderSecretWriteRequest,
  "providerKind" | "organizationId" | "appConnectionId" | "secretSyncId"
>;

/** Fails closed when a request carries another provider's target shape into this adapter. */
function assertCloudflareRequestShape(request: {
  readonly providerKind: string;
  readonly githubProviderScope?: string | null;
  readonly targetRepoId?: string | null;
}): void {
  if (
    request.providerKind !== SECRET_SYNC_KINDS.cloudflareWorkerSecret ||
    (request.githubProviderScope ?? null) !== null ||
    (request.targetRepoId ?? null) !== null
  ) {
    throw new SecretSyncError(
      SECRET_SYNC_ERROR_CODES.invalidDestination,
      "cloudflare worker sync target configuration is invalid",
    );
  }
}

/**
 * Per-run adapter state: one adapter instance serves exactly one sync run,
 * staging every binding of that run into one staged Worker version and
 * deploying it once. A resumed run constructs a fresh adapter and restages
 * from scratch, so an abandoned staged version is never deployed.
 */
interface CloudflareAdapterState {
  staged: { readonly stagedVersionToken: string } | null;
  scriptNamePromise: Promise<string> | null;
}

interface CloudflareAdapterInput {
  readonly client: CloudflareWorkerSecretsClient;
  readonly destinationNameResolver: SecretSyncDestinationNameResolver;
  readonly workerScriptNameResolver: CloudflareWorkerScriptNameResolver;
}

function resolveDestination(
  state: CloudflareAdapterState,
  input: CloudflareAdapterInput,
  scope: CloudflareRequestScope,
): Promise<CloudflareWorkerDestinationRef> {
  state.scriptNamePromise ??= input.workerScriptNameResolver.resolveWorkerScriptName({
    organizationId: scope.organizationId,
    secretSyncId: scope.secretSyncId,
  });
  return state.scriptNamePromise.then((workerScriptName) => ({
    organizationId: scope.organizationId,
    appConnectionId: scope.appConnectionId,
    workerScriptName,
  }));
}

async function lookupExact(
  state: CloudflareAdapterState,
  input: CloudflareAdapterInput,
  request: ProviderDestinationLookupRequest,
): Promise<ProviderDestinationLookupResult> {
  if (
    request.providerKind !== SECRET_SYNC_KINDS.cloudflareWorkerSecret ||
    !request.hasWorkerScriptTarget ||
    request.githubProviderScope !== null ||
    request.targetRepoId !== null
  ) {
    return { status: PROVIDER_LOOKUP_STATUSES.boundaryMismatch };
  }
  const destination = await resolveDestination(state, input, request);
  const destinationName = await input.destinationNameResolver.resolveDestinationName({
    organizationId: request.organizationId,
    secretSyncId: request.secretSyncId,
    bindingId: request.bindingId,
  });
  const ack = await input.client.lookupWorkerSecretBinding({ destination, destinationName });
  return { status: LOOKUP_STATUS_BY_CALL_RESULT[ack.result] };
}

/**
 * Stages one exact binding into the run's single staged Worker version
 * (ADR-0039/ADR-0057). `written` here means staged: nothing reaches the
 * deployed Worker until `commitStaged` deploys the staged version once, and
 * the engine downgrades every binding record if that single deploy fails.
 */
async function stageExact(
  state: CloudflareAdapterState,
  input: CloudflareAdapterInput,
  request: ProviderSecretWriteRequest,
): Promise<ProviderSecretWriteResult> {
  assertCloudflareRequestShape(request);
  assertCloudflareDestinationNameValid(request.destinationName);
  const destination = await resolveDestination(state, input, request);

  if (state.staged === null) {
    const begun = await input.client.beginWorkerSecretsVersion(destination);
    if (begun.result !== CLOUDFLARE_PROVIDER_CALL_RESULTS.ok) {
      return { status: WRITE_STATUS_BY_CALL_RESULT[begun.result] };
    }
    state.staged = { stagedVersionToken: begun.stagedVersionToken };
  }

  const ack = await input.client.stageWorkerSecretBinding({
    destination,
    stagedVersionToken: state.staged.stagedVersionToken,
    destinationName: request.destinationName,
    value: request.value,
  });
  return { status: WRITE_STATUS_BY_CALL_RESULT[ack.result] };
}

/** The single deploy that commits the whole staged write set; one attempt per staged version. */
async function commitStaged(
  state: CloudflareAdapterState,
  input: CloudflareAdapterInput,
  request: ProviderStagedCommitRequest,
): Promise<ProviderSecretWriteResult> {
  assertCloudflareRequestShape(request);
  const staged = state.staged;
  state.staged = null;
  if (staged === null) {
    // Nothing was staged in this run instance; fail closed without a deploy.
    return { status: PROVIDER_WRITE_STATUSES.retryableUnavailable };
  }
  const destination = await resolveDestination(state, input, request);
  const ack = await input.client.deployStagedWorkerVersion({
    destination,
    stagedVersionToken: staged.stagedVersionToken,
  });
  return { status: WRITE_STATUS_BY_CALL_RESULT[ack.result] };
}

export interface CloudflareWorkerSyncAdapter {
  readonly lookupPort: SecretSyncProviderLookupPort;
  readonly writePort: SecretSyncProviderWritePort;
}

/**
 * Cloudflare Worker secret sync adapter (INS-79) behind the provider lookup
 * and write ports. It addresses only the exact Worker script pinned by the
 * sync target and the exact secret binding names named by Secret Sync
 * Bindings, stages all bindings of a run into one new Worker version, and
 * deploys once — a Cloudflare Worker secret write is a production deploy
 * (ADR-0039), so no per-binding partial state is possible. It reports
 * normalized metadata-only statuses, never reads provider secret values
 * back, and never lets provider-native failure detail, script names, or
 * Sensitive Values escape.
 */
export function createCloudflareWorkerSyncAdapter(
  input: CloudflareAdapterInput,
): CloudflareWorkerSyncAdapter {
  const state: CloudflareAdapterState = { staged: null, scriptNamePromise: null };
  return {
    lookupPort: {
      lookupExactDestination: (request) => lookupExact(state, input, request),
    },
    writePort: {
      assertWritableDestination: assertCloudflareWritableDestination,
      writeExactDestination: (request) => stageExact(state, input, request),
      commitStagedWrites: (request) => commitStaged(state, input, request),
    },
  };
}
