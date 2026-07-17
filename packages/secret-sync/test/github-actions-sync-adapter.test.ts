import { blake2b } from "@noble/hashes/blake2.js";
import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";

import { PlaintextHandle } from "@insecur/crypto";
import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";

import { GITHUB_PROVIDER_CALL_RESULTS } from "../src/github-actions-provider-client.js";
import {
  GITHUB_ACTIONS_PROVIDER_VALUE_SIZE_LIMIT_BYTES,
  createGitHubActionsSyncAdapter,
} from "../src/github-actions-sync-adapter.js";
import { PROVIDER_LOOKUP_STATUSES } from "../src/provider-lookup-port.js";
import { PROVIDER_WRITE_STATUSES } from "../src/provider-sync-write-port.js";
import {
  createFakeGitHubActionsClient,
  type FakeGitHubActionsClient,
} from "./helpers/fake-github-actions-client.js";
import { BINDING, CONN, ORG, SYNC } from "./helpers/secret-sync-test-fixtures.js";

const DESTINATION_NAME = "DEPLOY_TOKEN";
const SECRET_VALUE = "provider-payload-value";

function adapterFor(fake: FakeGitHubActionsClient) {
  return createGitHubActionsSyncAdapter({
    client: fake.client,
    destinationNameResolver: {
      resolveDestinationName: async () => DESTINATION_NAME,
    },
  });
}

function writeRequest(
  overrides: Partial<
    Parameters<ReturnType<typeof adapterFor>["writePort"]["writeExactDestination"]>[0]
  > = {},
) {
  return {
    providerKind: "github-actions" as const,
    organizationId: ORG,
    appConnectionId: CONN,
    secretSyncId: SYNC,
    bindingId: BINDING,
    githubProviderScope: "repository" as const,
    targetRepoId: "repo_00000000000000000000000001",
    targetGithubEnvironmentId: null,
    destinationName: DESTINATION_NAME,
    value: new PlaintextHandle(new TextEncoder().encode(SECRET_VALUE)),
    ...overrides,
  };
}

function lookupRequest(overrides: Record<string, unknown> = {}) {
  return {
    providerKind: "github-actions" as const,
    organizationId: ORG,
    appConnectionId: CONN,
    secretSyncId: SYNC,
    bindingId: BINDING,
    githubProviderScope: "repository" as const,
    targetRepoId: "repo_00000000000000000000000001",
    targetGithubEnvironmentId: null,
    hasWorkerScriptTarget: false,
    ...overrides,
  };
}

function openSealed(sealedBase64: string, recipient: nacl.BoxKeyPair): Uint8Array | null {
  const sealed = Uint8Array.from(Buffer.from(sealedBase64, "base64"));
  const ephemeralPublicKey = sealed.slice(0, 32);
  const nonceInput = new Uint8Array(64);
  nonceInput.set(ephemeralPublicKey, 0);
  nonceInput.set(recipient.publicKey, 32);
  const nonce = blake2b(nonceInput, { dkLen: 24 });
  return nacl.box.open(sealed.slice(32), nonce, ephemeralPublicKey, recipient.secretKey);
}

describe("github actions sync adapter write port", () => {
  it("seals with the destination public key and PUTs only the sealed payload", async () => {
    const fake = createFakeGitHubActionsClient();
    const adapter = adapterFor(fake);

    const result = await adapter.writePort.writeExactDestination(writeRequest());

    expect(result.status).toBe(PROVIDER_WRITE_STATUSES.written);
    expect(fake.putCalls).toHaveLength(1);
    const put = fake.putCalls[0];
    expect(put?.keyId).toBe("github-key-id-1");
    expect(put?.destinationName).toBe(DESTINATION_NAME);
    // The provider payload is sealed-box ciphertext, never the plaintext.
    expect(put?.sealedValueBase64).not.toContain(SECRET_VALUE);
    const opened = openSealed(put?.sealedValueBase64 ?? "", fake.recipientKeyPair);
    expect(new TextDecoder().decode(opened ?? new Uint8Array())).toBe(SECRET_VALUE);
  });

  it("maps a denied public-key fetch to permission_denied and writes nothing", async () => {
    const fake = createFakeGitHubActionsClient({
      publicKeyResult: GITHUB_PROVIDER_CALL_RESULTS.permissionDenied,
    });
    const adapter = adapterFor(fake);

    const result = await adapter.writePort.writeExactDestination(writeRequest());

    expect(result.status).toBe(PROVIDER_WRITE_STATUSES.permissionDenied);
    expect(fake.putCalls).toHaveLength(0);
  });

  it("maps a missing repo/environment to target_missing", async () => {
    const fake = createFakeGitHubActionsClient({
      putResult: GITHUB_PROVIDER_CALL_RESULTS.notFound,
    });
    const adapter = adapterFor(fake);

    const result = await adapter.writePort.writeExactDestination(writeRequest());

    expect(result.status).toBe(PROVIDER_WRITE_STATUSES.targetMissing);
  });

  it("maps transport failures to retryable_unavailable", async () => {
    const fake = createFakeGitHubActionsClient({
      putResult: GITHUB_PROVIDER_CALL_RESULTS.unavailable,
    });
    const adapter = adapterFor(fake);

    const result = await adapter.writePort.writeExactDestination(writeRequest());

    expect(result.status).toBe(PROVIDER_WRITE_STATUSES.retryableUnavailable);
  });

  it("rejects an environment-scoped write without a github environment id", async () => {
    const fake = createFakeGitHubActionsClient();
    const adapter = adapterFor(fake);

    await expect(
      adapter.writePort.writeExactDestination(
        writeRequest({ githubProviderScope: "environment", targetGithubEnvironmentId: null }),
      ),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.invalidDestination });
    expect(fake.publicKeyCalls).toHaveLength(0);
  });

  it.each(["1BAD", "has-dash", "GITHUB_RESERVED", "github_reserved", ""])(
    "rejects invalid github secret name %j in the pre-write gate",
    (name) => {
      const adapter = adapterFor(createFakeGitHubActionsClient());
      expect(() =>
        adapter.writePort.assertWritableDestination({
          destinationName: name,
          valueByteLength: 10,
        }),
      ).toThrowError(
        expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.invalidDestination }) as Error,
      );
    },
  );

  it("rejects values over the 48 KB github provider value size limit", () => {
    const adapter = adapterFor(createFakeGitHubActionsClient());
    expect(() =>
      adapter.writePort.assertWritableDestination({
        destinationName: DESTINATION_NAME,
        valueByteLength: GITHUB_ACTIONS_PROVIDER_VALUE_SIZE_LIMIT_BYTES + 1,
      }),
    ).toThrowError(
      expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.providerValueTooLarge }) as Error,
    );
    expect(() =>
      adapter.writePort.assertWritableDestination({
        destinationName: DESTINATION_NAME,
        valueByteLength: GITHUB_ACTIONS_PROVIDER_VALUE_SIZE_LIMIT_BYTES,
      }),
    ).not.toThrow();
  });
});

describe("github actions sync adapter lookup port", () => {
  it("maps exact-destination lookups onto normalized lookup statuses", async () => {
    const cases = [
      [GITHUB_PROVIDER_CALL_RESULTS.ok, PROVIDER_LOOKUP_STATUSES.found],
      [GITHUB_PROVIDER_CALL_RESULTS.notFound, PROVIDER_LOOKUP_STATUSES.notFound],
      [GITHUB_PROVIDER_CALL_RESULTS.targetMissing, PROVIDER_LOOKUP_STATUSES.targetMissing],
      [GITHUB_PROVIDER_CALL_RESULTS.permissionDenied, PROVIDER_LOOKUP_STATUSES.permissionDenied],
      [GITHUB_PROVIDER_CALL_RESULTS.unavailable, PROVIDER_LOOKUP_STATUSES.unavailable],
    ] as const;

    for (const [callResult, lookupStatus] of cases) {
      const fake = createFakeGitHubActionsClient({ lookupResult: callResult });
      const adapter = adapterFor(fake);
      const result = await adapter.lookupPort.lookupExactDestination(lookupRequest());
      expect(result.status).toBe(lookupStatus);
    }
  });

  it("looks up only the exact configured destination name", async () => {
    const fake = createFakeGitHubActionsClient();
    const adapter = adapterFor(fake);

    await adapter.lookupPort.lookupExactDestination(lookupRequest());

    expect(fake.lookupCalls).toEqual([{ destinationName: DESTINATION_NAME }]);
  });

  it("fails closed as boundary_mismatch for a non-github or malformed target", async () => {
    const adapter = adapterFor(createFakeGitHubActionsClient());

    const wrongKind = await adapter.lookupPort.lookupExactDestination(
      lookupRequest({ providerKind: "cloudflare-worker-secret", hasWorkerScriptTarget: true }),
    );
    const missingRepo = await adapter.lookupPort.lookupExactDestination(
      lookupRequest({ targetRepoId: null }),
    );

    expect(wrongKind.status).toBe(PROVIDER_LOOKUP_STATUSES.boundaryMismatch);
    expect(missingRepo.status).toBe(PROVIDER_LOOKUP_STATUSES.boundaryMismatch);
  });
});
