import type { AppConnectionId, GitHubActionsProviderScope, OrganizationId } from "@insecur/domain";

/**
 * Normalized GitHub API call results. The client seam is the only place raw
 * GitHub responses exist; everything above it sees these stable dotted codes
 * plus the metadata-only public key material. Provider-native error text,
 * response bodies, and headers must never escape a client implementation.
 */
export const GITHUB_PROVIDER_CALL_RESULTS = {
  ok: "github_call.ok",
  /** The exact secret name does not exist (repo/environment itself exists). */
  notFound: "github_call.not_found",
  /** The configured repository or GitHub Environment no longer exists. */
  targetMissing: "github_call.target_missing",
  /** The installation credential lacks scope for this call. */
  permissionDenied: "github_call.permission_denied",
  /** Transport failure, rate limit, or unclassifiable response. */
  unavailable: "github_call.unavailable",
} as const;

export type GitHubProviderCallResult =
  (typeof GITHUB_PROVIDER_CALL_RESULTS)[keyof typeof GITHUB_PROVIDER_CALL_RESULTS];

/**
 * The exact GitHub Actions destination addressed by one Secret Sync Binding:
 * one repository (by opaque provider repo id) or one GitHub Environment
 * inside it. `destinationName` is decrypted Sensitive Metadata; client
 * implementations may place it only in the provider request itself.
 */
export interface GitHubActionsDestinationRef {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly githubProviderScope: GitHubActionsProviderScope;
  readonly targetRepoId: string;
  readonly targetGithubEnvironmentId: string | null;
}

interface GitHubDestinationPublicKey {
  readonly result: typeof GITHUB_PROVIDER_CALL_RESULTS.ok;
  /** GitHub key id echoed back on the secret PUT. */
  readonly keyId: string;
  /** Base64 Curve25519 public key for libsodium sealed-box encryption. */
  readonly publicKeyBase64: string;
}

interface GitHubProviderCallFailure {
  readonly result: Exclude<GitHubProviderCallResult, typeof GITHUB_PROVIDER_CALL_RESULTS.ok>;
}

export type GitHubDestinationPublicKeyResult =
  GitHubDestinationPublicKey | GitHubProviderCallFailure;

export interface GitHubProviderCallAck {
  readonly result: GitHubProviderCallResult;
}

/**
 * Metadata-only GitHub Actions secrets client port (INS-78). Three exact
 * calls, mirroring GitHub's public-key secret flow: fetch the destination
 * public key, PUT one sealed secret, and check one exact secret's existence.
 * No inventory, list, or readback calls exist by construction; GitHub secrets
 * are write-only after creation and insecur never reads provider values back.
 */
export interface GitHubActionsSecretsClient {
  getDestinationPublicKey(
    destination: GitHubActionsDestinationRef,
  ): Promise<GitHubDestinationPublicKeyResult>;
  putSealedDestinationSecret(input: {
    readonly destination: GitHubActionsDestinationRef;
    readonly destinationName: string;
    readonly keyId: string;
    readonly sealedValueBase64: string;
  }): Promise<GitHubProviderCallAck>;
  lookupDestinationSecret(input: {
    readonly destination: GitHubActionsDestinationRef;
    readonly destinationName: string;
  }): Promise<GitHubProviderCallAck>;
}

/**
 * Fail-closed client used until a provider-backed transport is configured
 * (the GitHub App installation-token seam from the INS-75 provider app
 * registration, same pattern as `createGitHubAppInstallationPort`). Every
 * call reports `unavailable`, so plans surface `provider.unavailable`,
 * Sync Execution Revalidation blocks, and no Sensitive Value is decrypted
 * for a write that could not happen.
 */
export function createUnconfiguredGitHubActionsSecretsClient(): GitHubActionsSecretsClient {
  const unavailable = { result: GITHUB_PROVIDER_CALL_RESULTS.unavailable } as const;
  return {
    getDestinationPublicKey: () => Promise.resolve(unavailable),
    putSealedDestinationSecret: () => Promise.resolve(unavailable),
    lookupDestinationSecret: () => Promise.resolve(unavailable),
  };
}
