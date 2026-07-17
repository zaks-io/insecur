import {
  CLOUDFLARE_PROVIDER_CALL_RESULTS,
  type CloudflareProviderCallResult,
  type CloudflareWorkerSecretsClient,
} from "../../src/cloudflare-worker-provider-client.js";

export interface FakeCloudflareWorkerClient {
  readonly client: CloudflareWorkerSecretsClient;
  readonly beginCalls: { readonly workerScriptName: string }[];
  readonly stageCalls: {
    readonly workerScriptName: string;
    readonly stagedVersionToken: string;
    readonly destinationName: string;
  }[];
  readonly deployCalls: {
    readonly workerScriptName: string;
    readonly stagedVersionToken: string;
  }[];
  readonly lookupCalls: {
    readonly workerScriptName: string;
    readonly destinationName: string;
  }[];
}

/**
 * Fake Cloudflare Worker secrets client with scripted normalized results.
 * It records only metadata about staged writes (never unwrapping the
 * PlaintextHandle), so tests can prove Sensitive Values stay inside the
 * handle up to the client seam and that exactly one deploy commits a run.
 */
interface FakeCloudflareClientOverrides {
  readonly beginResult?: CloudflareProviderCallResult;
  readonly stageResult?: CloudflareProviderCallResult;
  readonly deployResult?: CloudflareProviderCallResult;
  readonly lookupResult?: CloudflareProviderCallResult;
  readonly stageResultByDestinationName?: Readonly<Record<string, CloudflareProviderCallResult>>;
}

function beginResultFor(
  overrides: FakeCloudflareClientOverrides,
  beginCalls: FakeCloudflareWorkerClient["beginCalls"],
) {
  const result = overrides.beginResult ?? CLOUDFLARE_PROVIDER_CALL_RESULTS.ok;
  if (result !== CLOUDFLARE_PROVIDER_CALL_RESULTS.ok) {
    return { result };
  }
  return { result, stagedVersionToken: `staged-version-${String(beginCalls.length)}` };
}

export function createFakeCloudflareWorkerClient(
  overrides: FakeCloudflareClientOverrides = {},
): FakeCloudflareWorkerClient {
  const beginCalls: FakeCloudflareWorkerClient["beginCalls"] = [];
  const stageCalls: FakeCloudflareWorkerClient["stageCalls"] = [];
  const deployCalls: FakeCloudflareWorkerClient["deployCalls"] = [];
  const lookupCalls: FakeCloudflareWorkerClient["lookupCalls"] = [];

  const client: CloudflareWorkerSecretsClient = {
    beginWorkerSecretsVersion: async (destination) => {
      beginCalls.push({ workerScriptName: destination.workerScriptName });
      return beginResultFor(overrides, beginCalls);
    },
    stageWorkerSecretBinding: async (input) => {
      stageCalls.push({
        workerScriptName: input.destination.workerScriptName,
        stagedVersionToken: input.stagedVersionToken,
        destinationName: input.destinationName,
      });
      return {
        result:
          overrides.stageResultByDestinationName?.[input.destinationName] ??
          overrides.stageResult ??
          CLOUDFLARE_PROVIDER_CALL_RESULTS.ok,
      };
    },
    deployStagedWorkerVersion: async (input) => {
      deployCalls.push({
        workerScriptName: input.destination.workerScriptName,
        stagedVersionToken: input.stagedVersionToken,
      });
      return { result: overrides.deployResult ?? CLOUDFLARE_PROVIDER_CALL_RESULTS.ok };
    },
    lookupWorkerSecretBinding: async (input) => {
      lookupCalls.push({
        workerScriptName: input.destination.workerScriptName,
        destinationName: input.destinationName,
      });
      return { result: overrides.lookupResult ?? CLOUDFLARE_PROVIDER_CALL_RESULTS.notFound };
    },
  };

  return { client, beginCalls, stageCalls, deployCalls, lookupCalls };
}
