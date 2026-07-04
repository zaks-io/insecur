import type { AppConnectionId, OrganizationId, ProviderCredentialId } from "@insecur/domain";
import type { WrappedProviderCredential } from "@insecur/custody-contracts";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";

import { AppConnectionError, APP_CONNECTION_ERROR_CODES } from "./app-connection-error.js";

export interface AttachProviderCredentialInput {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly credentialId: ProviderCredentialId;
  readonly wrapped: WrappedProviderCredential;
  readonly appConnectionStore: TenantAppConnectionStore;
}

/**
 * Attaches an encrypted provider credential and activates the app connection.
 * Must run inside `withTenantScope` so credential upsert and connection activation
 * share one transaction and fail closed together.
 */
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

  return input.appConnectionStore.attachActiveProviderCredential({
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    credentialId: input.credentialId,
    connectionMethod: connection.connectionMethod,
    wrapped: input.wrapped,
  });
}
