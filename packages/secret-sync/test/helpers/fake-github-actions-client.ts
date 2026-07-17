import nacl from "tweetnacl";

import {
  GITHUB_PROVIDER_CALL_RESULTS,
  type GitHubActionsSecretsClient,
  type GitHubProviderCallResult,
} from "../../src/github-actions-provider-client.js";

export interface FakeGitHubActionsClient {
  readonly client: GitHubActionsSecretsClient;
  readonly recipientKeyPair: nacl.BoxKeyPair;
  readonly putCalls: {
    readonly destinationName: string;
    readonly keyId: string;
    readonly sealedValueBase64: string;
    readonly targetRepoId: string;
  }[];
  readonly lookupCalls: { readonly destinationName: string }[];
  readonly publicKeyCalls: number[];
}

/**
 * Fake GitHub secrets client: real Curve25519 recipient key so tests can
 * prove sealed payloads decrypt (and plaintext never crosses the seam),
 * scripted normalized results per call.
 */
export function createFakeGitHubActionsClient(
  overrides: {
    readonly publicKeyResult?: GitHubProviderCallResult;
    readonly putResult?: GitHubProviderCallResult;
    readonly lookupResult?: GitHubProviderCallResult;
    readonly putResultByDestinationName?: Readonly<Record<string, GitHubProviderCallResult>>;
  } = {},
): FakeGitHubActionsClient {
  const recipientKeyPair = nacl.box.keyPair();
  const putCalls: FakeGitHubActionsClient["putCalls"] = [];
  const lookupCalls: FakeGitHubActionsClient["lookupCalls"] = [];
  const publicKeyCalls: number[] = [];

  const client: GitHubActionsSecretsClient = {
    getDestinationPublicKey: async () => {
      publicKeyCalls.push(1);
      const result = overrides.publicKeyResult ?? GITHUB_PROVIDER_CALL_RESULTS.ok;
      if (result !== GITHUB_PROVIDER_CALL_RESULTS.ok) {
        return { result };
      }
      return {
        result,
        keyId: "github-key-id-1",
        publicKeyBase64: Buffer.from(recipientKeyPair.publicKey).toString("base64"),
      };
    },
    putSealedDestinationSecret: async (input) => {
      putCalls.push({
        destinationName: input.destinationName,
        keyId: input.keyId,
        sealedValueBase64: input.sealedValueBase64,
        targetRepoId: input.destination.targetRepoId,
      });
      return {
        result:
          overrides.putResultByDestinationName?.[input.destinationName] ??
          overrides.putResult ??
          GITHUB_PROVIDER_CALL_RESULTS.ok,
      };
    },
    lookupDestinationSecret: async (input) => {
      lookupCalls.push({ destinationName: input.destinationName });
      return { result: overrides.lookupResult ?? GITHUB_PROVIDER_CALL_RESULTS.notFound };
    },
  };

  return { client, recipientKeyPair, putCalls, lookupCalls, publicKeyCalls };
}
