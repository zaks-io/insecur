import { PlaintextHandle } from "@insecur/crypto";
import { SECRET_SYNC_ERROR_CODES, secretSyncBindingId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  CLOUDFLARE_PROVIDER_CALL_RESULTS,
  createUnconfiguredCloudflareWorkerSecretsClient,
} from "../src/cloudflare-worker-provider-client.js";
import {
  CLOUDFLARE_WORKER_PROVIDER_VALUE_SIZE_LIMIT_BYTES,
  createCloudflareWorkerSyncAdapter,
} from "../src/cloudflare-worker-sync-adapter.js";
import { PROVIDER_LOOKUP_STATUSES } from "../src/provider-lookup-port.js";
import { PROVIDER_WRITE_STATUSES } from "../src/provider-sync-write-port.js";
import {
  createFakeCloudflareWorkerClient,
  type FakeCloudflareWorkerClient,
} from "./helpers/fake-cloudflare-worker-client.js";
import { BINDING, CONN, ORG, SYNC } from "./helpers/secret-sync-test-fixtures.js";

const WORKER_SCRIPT_NAME = "my-api-production";
const DESTINATION_NAME = "DATABASE_URL";
const SECOND_DESTINATION_NAME = "API_TOKEN";
const SECRET_VALUE = "provider-payload-value";
const BINDING_2 = secretSyncBindingId.brand("sbind_00000000000000000000000002");

function adapterFor(fake: FakeCloudflareWorkerClient) {
  return createCloudflareWorkerSyncAdapter({
    client: fake.client,
    destinationNameResolver: {
      resolveDestinationName: async (input) =>
        input.bindingId === BINDING_2 ? SECOND_DESTINATION_NAME : DESTINATION_NAME,
    },
    workerScriptNameResolver: {
      resolveWorkerScriptName: async () => WORKER_SCRIPT_NAME,
    },
  });
}

function writeRequest(
  overrides: Partial<
    Parameters<ReturnType<typeof adapterFor>["writePort"]["writeExactDestination"]>[0]
  > = {},
) {
  return {
    providerKind: "cloudflare-worker-secret" as const,
    organizationId: ORG,
    appConnectionId: CONN,
    secretSyncId: SYNC,
    bindingId: BINDING,
    githubProviderScope: null,
    targetRepoId: null,
    targetGithubEnvironmentId: null,
    destinationName: DESTINATION_NAME,
    value: new PlaintextHandle(new TextEncoder().encode(SECRET_VALUE)),
    ...overrides,
  };
}

function commitRequest() {
  return {
    providerKind: "cloudflare-worker-secret" as const,
    organizationId: ORG,
    appConnectionId: CONN,
    secretSyncId: SYNC,
  };
}

function lookupRequest(overrides: Record<string, unknown> = {}) {
  return {
    providerKind: "cloudflare-worker-secret" as const,
    organizationId: ORG,
    appConnectionId: CONN,
    secretSyncId: SYNC,
    bindingId: BINDING,
    githubProviderScope: null,
    targetRepoId: null,
    targetGithubEnvironmentId: null,
    hasWorkerScriptTarget: true,
    ...overrides,
  };
}

describe("cloudflare worker sync adapter write port", () => {
  it("stages every binding into one staged version and deploys exactly once", async () => {
    const fake = createFakeCloudflareWorkerClient();
    const adapter = adapterFor(fake);

    const first = await adapter.writePort.writeExactDestination(writeRequest());
    const second = await adapter.writePort.writeExactDestination(
      writeRequest({ bindingId: BINDING_2, destinationName: SECOND_DESTINATION_NAME }),
    );
    const committed = await adapter.writePort.commitStagedWrites?.(commitRequest());

    expect(first.status).toBe(PROVIDER_WRITE_STATUSES.written);
    expect(second.status).toBe(PROVIDER_WRITE_STATUSES.written);
    expect(committed?.status).toBe(PROVIDER_WRITE_STATUSES.written);
    // One staged Worker version for the whole run, addressed by the exact script.
    expect(fake.beginCalls).toEqual([{ workerScriptName: WORKER_SCRIPT_NAME }]);
    expect(fake.stageCalls.map((call) => call.destinationName)).toEqual([
      DESTINATION_NAME,
      SECOND_DESTINATION_NAME,
    ]);
    expect(new Set(fake.stageCalls.map((call) => call.stagedVersionToken)).size).toBe(1);
    // Exactly one deploy commits the run (ADR-0039/ADR-0057).
    expect(fake.deployCalls).toEqual([
      { workerScriptName: WORKER_SCRIPT_NAME, stagedVersionToken: "staged-version-1" },
    ]);
  });

  it("leaves the deployed worker untouched when staging fails: no deploy happens", async () => {
    const fake = createFakeCloudflareWorkerClient({
      stageResultByDestinationName: {
        [SECOND_DESTINATION_NAME]: CLOUDFLARE_PROVIDER_CALL_RESULTS.unavailable,
      },
    });
    const adapter = adapterFor(fake);

    const first = await adapter.writePort.writeExactDestination(writeRequest());
    const second = await adapter.writePort.writeExactDestination(
      writeRequest({ bindingId: BINDING_2, destinationName: SECOND_DESTINATION_NAME }),
    );

    expect(first.status).toBe(PROVIDER_WRITE_STATUSES.written);
    expect(second.status).toBe(PROVIDER_WRITE_STATUSES.retryableUnavailable);
    // The engine never commits a run with failures; the staged version is inert.
    expect(fake.deployCalls).toHaveLength(0);
  });

  it("maps a denied worker scope on begin to permission_denied and stages nothing", async () => {
    const fake = createFakeCloudflareWorkerClient({
      beginResult: CLOUDFLARE_PROVIDER_CALL_RESULTS.permissionDenied,
    });
    const adapter = adapterFor(fake);

    const result = await adapter.writePort.writeExactDestination(writeRequest());

    expect(result.status).toBe(PROVIDER_WRITE_STATUSES.permissionDenied);
    expect(fake.stageCalls).toHaveLength(0);
    expect(fake.deployCalls).toHaveLength(0);
  });

  it("maps a missing worker script to target_missing", async () => {
    const fake = createFakeCloudflareWorkerClient({
      stageResult: CLOUDFLARE_PROVIDER_CALL_RESULTS.targetMissing,
    });
    const adapter = adapterFor(fake);

    const result = await adapter.writePort.writeExactDestination(writeRequest());

    expect(result.status).toBe(PROVIDER_WRITE_STATUSES.targetMissing);
  });

  it("maps deploy failures onto write statuses without leaking detail", async () => {
    const cases = [
      [CLOUDFLARE_PROVIDER_CALL_RESULTS.unavailable, PROVIDER_WRITE_STATUSES.retryableUnavailable],
      [CLOUDFLARE_PROVIDER_CALL_RESULTS.permissionDenied, PROVIDER_WRITE_STATUSES.permissionDenied],
      [CLOUDFLARE_PROVIDER_CALL_RESULTS.notFound, PROVIDER_WRITE_STATUSES.targetMissing],
      [CLOUDFLARE_PROVIDER_CALL_RESULTS.targetMissing, PROVIDER_WRITE_STATUSES.targetMissing],
    ] as const;

    for (const [deployResult, writeStatus] of cases) {
      const fake = createFakeCloudflareWorkerClient({ deployResult });
      const adapter = adapterFor(fake);
      await adapter.writePort.writeExactDestination(writeRequest());
      const committed = await adapter.writePort.commitStagedWrites?.(commitRequest());
      expect(committed?.status).toBe(writeStatus);
    }
  });

  it("fails a commit closed without a deploy when nothing was staged", async () => {
    const fake = createFakeCloudflareWorkerClient();
    const adapter = adapterFor(fake);

    const committed = await adapter.writePort.commitStagedWrites?.(commitRequest());

    expect(committed?.status).toBe(PROVIDER_WRITE_STATUSES.retryableUnavailable);
    expect(fake.deployCalls).toHaveLength(0);
  });

  it("never deploys the same staged version twice: a second commit fails closed", async () => {
    const fake = createFakeCloudflareWorkerClient();
    const adapter = adapterFor(fake);

    await adapter.writePort.writeExactDestination(writeRequest());
    const first = await adapter.writePort.commitStagedWrites?.(commitRequest());
    const second = await adapter.writePort.commitStagedWrites?.(commitRequest());

    expect(first?.status).toBe(PROVIDER_WRITE_STATUSES.written);
    expect(second?.status).toBe(PROVIDER_WRITE_STATUSES.retryableUnavailable);
    expect(fake.deployCalls).toHaveLength(1);
  });

  it("rejects a request carrying another provider's target shape", async () => {
    const fake = createFakeCloudflareWorkerClient();
    const adapter = adapterFor(fake);

    await expect(
      adapter.writePort.writeExactDestination(
        writeRequest({ targetRepoId: "repo_00000000000000000000000001" }),
      ),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.invalidDestination });
    await expect(
      adapter.writePort.writeExactDestination(
        writeRequest({ providerKind: "github-actions", githubProviderScope: "repository" }),
      ),
    ).rejects.toMatchObject({ code: SECRET_SYNC_ERROR_CODES.invalidDestination });
    expect(fake.beginCalls).toHaveLength(0);
  });

  it.each(["1BAD", "has-dash", "has space", "with.dot", ""])(
    "rejects invalid worker secret binding name %j in the pre-write gate",
    (name) => {
      const adapter = adapterFor(createFakeCloudflareWorkerClient());
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

  it("rejects values over the 5 KB cloudflare provider value size limit", () => {
    const adapter = adapterFor(createFakeCloudflareWorkerClient());
    expect(() =>
      adapter.writePort.assertWritableDestination({
        destinationName: DESTINATION_NAME,
        valueByteLength: CLOUDFLARE_WORKER_PROVIDER_VALUE_SIZE_LIMIT_BYTES + 1,
      }),
    ).toThrowError(
      expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.providerValueTooLarge }) as Error,
    );
    expect(() =>
      adapter.writePort.assertWritableDestination({
        destinationName: DESTINATION_NAME,
        valueByteLength: CLOUDFLARE_WORKER_PROVIDER_VALUE_SIZE_LIMIT_BYTES,
      }),
    ).not.toThrow();
  });
});

describe("cloudflare worker sync adapter lookup port", () => {
  it("maps exact-destination lookups onto normalized lookup statuses", async () => {
    const cases = [
      [CLOUDFLARE_PROVIDER_CALL_RESULTS.ok, PROVIDER_LOOKUP_STATUSES.found],
      [CLOUDFLARE_PROVIDER_CALL_RESULTS.notFound, PROVIDER_LOOKUP_STATUSES.notFound],
      [CLOUDFLARE_PROVIDER_CALL_RESULTS.targetMissing, PROVIDER_LOOKUP_STATUSES.targetMissing],
      [
        CLOUDFLARE_PROVIDER_CALL_RESULTS.permissionDenied,
        PROVIDER_LOOKUP_STATUSES.permissionDenied,
      ],
      [CLOUDFLARE_PROVIDER_CALL_RESULTS.unavailable, PROVIDER_LOOKUP_STATUSES.unavailable],
    ] as const;

    for (const [callResult, lookupStatus] of cases) {
      const fake = createFakeCloudflareWorkerClient({ lookupResult: callResult });
      const adapter = adapterFor(fake);
      const result = await adapter.lookupPort.lookupExactDestination(lookupRequest());
      expect(result.status).toBe(lookupStatus);
    }
  });

  it("looks up only the exact configured script and destination name", async () => {
    const fake = createFakeCloudflareWorkerClient();
    const adapter = adapterFor(fake);

    await adapter.lookupPort.lookupExactDestination(lookupRequest());

    expect(fake.lookupCalls).toEqual([
      { workerScriptName: WORKER_SCRIPT_NAME, destinationName: DESTINATION_NAME },
    ]);
  });

  it("fails closed as boundary_mismatch for a non-cloudflare or malformed target", async () => {
    const adapter = adapterFor(createFakeCloudflareWorkerClient());

    const wrongKind = await adapter.lookupPort.lookupExactDestination(
      lookupRequest({ providerKind: "github-actions", hasWorkerScriptTarget: false }),
    );
    const missingScriptTarget = await adapter.lookupPort.lookupExactDestination(
      lookupRequest({ hasWorkerScriptTarget: false }),
    );
    const githubShapedTarget = await adapter.lookupPort.lookupExactDestination(
      lookupRequest({ targetRepoId: "repo_00000000000000000000000001" }),
    );

    expect(wrongKind.status).toBe(PROVIDER_LOOKUP_STATUSES.boundaryMismatch);
    expect(missingScriptTarget.status).toBe(PROVIDER_LOOKUP_STATUSES.boundaryMismatch);
    expect(githubShapedTarget.status).toBe(PROVIDER_LOOKUP_STATUSES.boundaryMismatch);
  });
});

describe("unconfigured cloudflare worker secrets client", () => {
  it("fails every call closed as unavailable until the INS-74 transport exists", async () => {
    const adapter = createCloudflareWorkerSyncAdapter({
      client: createUnconfiguredCloudflareWorkerSecretsClient(),
      destinationNameResolver: { resolveDestinationName: async () => DESTINATION_NAME },
      workerScriptNameResolver: { resolveWorkerScriptName: async () => WORKER_SCRIPT_NAME },
    });

    const written = await adapter.writePort.writeExactDestination(writeRequest());
    const looked = await adapter.lookupPort.lookupExactDestination(lookupRequest());
    const committed = await adapter.writePort.commitStagedWrites?.({
      providerKind: "cloudflare-worker-secret",
      organizationId: ORG,
      appConnectionId: CONN,
      secretSyncId: SYNC,
    });

    expect(written.status).toBe(PROVIDER_WRITE_STATUSES.retryableUnavailable);
    expect(looked.status).toBe(PROVIDER_LOOKUP_STATUSES.unavailable);
    expect(committed?.status).toBe(PROVIDER_WRITE_STATUSES.retryableUnavailable);
  });
});
