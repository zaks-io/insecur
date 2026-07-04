import type { AppConnectionId, OrganizationId, ProviderCredentialId } from "@insecur/domain";
import type { WrappedProviderCredential } from "@insecur/custody-contracts";
import type {
  AppConnectionRow,
  TenantAppConnectionStore,
  TenantProviderCredentialStore,
} from "@insecur/tenant-store";

import { AppConnectionError, APP_CONNECTION_ERROR_CODES } from "./app-connection-error.js";

export interface AttachProviderCredentialInput {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly credentialId: ProviderCredentialId;
  readonly wrapped: WrappedProviderCredential;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly providerCredentialStore: TenantProviderCredentialStore;
}

export async function attachProviderCredential(
  input: AttachProviderCredentialInput,
): Promise<AppConnectionRow> {
  const connection = await input.appConnectionStore.getConnectionById(
    input.organizationId,
    input.appConnectionId,
  );
  if (!connection) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.notFound);
  }

  await input.providerCredentialStore.upsertCredential({
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    provider: connection.connectionMethod,
    credentialId: input.credentialId,
    wrapped: input.wrapped,
  });

  return input.appConnectionStore.updateConnectionStatus({
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    status: "active",
    statusReasonCode: null,
    activeCredentialId: input.credentialId,
  });
}
