import type { PlaintextHandle } from "@insecur/crypto";
import type { AppConnectionId, OrganizationId } from "@insecur/domain";

/**
 * Normalized Cloudflare API call results. The client seam is the only place
 * raw Cloudflare responses exist; everything above it sees these stable
 * dotted codes. Provider-native error text, response bodies, and headers
 * must never escape a client implementation.
 */
export const CLOUDFLARE_PROVIDER_CALL_RESULTS = {
  ok: "cloudflare_call.ok",
  /** The exact secret binding name does not exist (the Worker script itself exists). */
  notFound: "cloudflare_call.not_found",
  /** The configured Worker script no longer exists in the pinned account. */
  targetMissing: "cloudflare_call.target_missing",
  /** The scoped token lacks permission for this Worker script or call. */
  permissionDenied: "cloudflare_call.permission_denied",
  /** Transport failure, rate limit, or unclassifiable response. */
  unavailable: "cloudflare_call.unavailable",
} as const;

export type CloudflareProviderCallResult =
  (typeof CLOUDFLARE_PROVIDER_CALL_RESULTS)[keyof typeof CLOUDFLARE_PROVIDER_CALL_RESULTS];

/**
 * The exact Cloudflare Worker script addressed by one Secret Sync inside one
 * App Connection boundary. `workerScriptName` is decrypted Sensitive
 * Metadata; client implementations may place it only in the provider request
 * itself, never in logs, errors, or returned metadata.
 */
export interface CloudflareWorkerDestinationRef {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly workerScriptName: string;
}

export interface CloudflareProviderCallAck {
  readonly result: CloudflareProviderCallResult;
}

interface CloudflareStagedVersionOk {
  readonly result: typeof CLOUDFLARE_PROVIDER_CALL_RESULTS.ok;
  /** Opaque provider token naming the staged (not yet deployed) Worker version. */
  readonly stagedVersionToken: string;
}

interface CloudflareProviderCallFailure {
  readonly result: Exclude<
    CloudflareProviderCallResult,
    typeof CLOUDFLARE_PROVIDER_CALL_RESULTS.ok
  >;
}

export type CloudflareStagedVersionResult =
  CloudflareStagedVersionOk | CloudflareProviderCallFailure;

/**
 * Metadata-only Cloudflare Worker secrets client port (INS-79). A Cloudflare
 * Worker secret write is a production deploy (ADR-0039/ADR-0057), so the port
 * models one-deploy-per-run by construction: begin one staged Worker version,
 * stage each exact secret binding into it, then deploy that staged version
 * exactly once. A staging failure leaves the deployed Worker untouched
 * because an undeployed staged version is inert; only `deployStagedWorkerVersion`
 * commits. No inventory, list, delete, or readback calls exist by
 * construction; insecur never reads provider secret values back.
 */
export interface CloudflareWorkerSecretsClient {
  beginWorkerSecretsVersion(
    destination: CloudflareWorkerDestinationRef,
  ): Promise<CloudflareStagedVersionResult>;
  stageWorkerSecretBinding(input: {
    readonly destination: CloudflareWorkerDestinationRef;
    readonly stagedVersionToken: string;
    readonly destinationName: string;
    /** Decrypted Sensitive Value; unwrapped only inside the provider request itself. */
    readonly value: PlaintextHandle;
  }): Promise<CloudflareProviderCallAck>;
  deployStagedWorkerVersion(input: {
    readonly destination: CloudflareWorkerDestinationRef;
    readonly stagedVersionToken: string;
  }): Promise<CloudflareProviderCallAck>;
  /** Metadata-only existence check for one exact secret binding name; never values. */
  lookupWorkerSecretBinding(input: {
    readonly destination: CloudflareWorkerDestinationRef;
    readonly destinationName: string;
  }): Promise<CloudflareProviderCallAck>;
}

/**
 * Fail-closed client used until the Cloudflare App Connection scoped-token
 * transport from INS-74 is configured (Cloudflare is the manual-token
 * exception per ADR-0039). Every call reports `unavailable`, so plans surface
 * `provider.unavailable`, Sync Execution Revalidation blocks, and no
 * Sensitive Value is decrypted for a write that could not happen.
 */
export function createUnconfiguredCloudflareWorkerSecretsClient(): CloudflareWorkerSecretsClient {
  const unavailable = { result: CLOUDFLARE_PROVIDER_CALL_RESULTS.unavailable } as const;
  return {
    beginWorkerSecretsVersion: () => Promise.resolve(unavailable),
    stageWorkerSecretBinding: () => Promise.resolve(unavailable),
    deployStagedWorkerVersion: () => Promise.resolve(unavailable),
    lookupWorkerSecretBinding: () => Promise.resolve(unavailable),
  };
}
