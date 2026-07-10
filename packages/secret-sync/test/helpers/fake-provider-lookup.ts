import {
  PROVIDER_LOOKUP_STATUSES,
  type ProviderDestinationLookupRequest,
  type ProviderLookupStatus,
  type SecretSyncProviderLookupPort,
} from "../../src/provider-lookup-port.js";

export interface FakeProviderLookup {
  readonly port: SecretSyncProviderLookupPort;
  readonly requests: ProviderDestinationLookupRequest[];
}

/** Fake metadata-only lookup adapter: answers per binding ID, records requests. */
export function createFakeProviderLookupPort(
  statusByBindingId: Readonly<Record<string, ProviderLookupStatus>> = {},
  defaultStatus: ProviderLookupStatus = PROVIDER_LOOKUP_STATUSES.notFound,
): FakeProviderLookup {
  const requests: ProviderDestinationLookupRequest[] = [];
  return {
    requests,
    port: {
      lookupExactDestination: async (request) => {
        requests.push(request);
        return { status: statusByBindingId[request.bindingId] ?? defaultStatus };
      },
    },
  };
}
