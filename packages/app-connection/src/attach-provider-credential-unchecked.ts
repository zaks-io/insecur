import type { AppConnectionId, OrganizationId, ProviderCredentialId } from "@insecur/domain";
import type { WrappedProviderCredential } from "@insecur/custody-contracts";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";

import { AppConnectionError, APP_CONNECTION_ERROR_CODES } from "./app-connection-error.js";

export interface AttachProviderCredentialUncheckedInput {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly credentialId: ProviderCredentialId;
  readonly wrapped: WrappedProviderCredential;
  readonly appConnectionStore: TenantAppConnectionStore;
}

/**
 * Internal credential attach primitive. Product callers must consume cleared
 * high-assurance evidence before invoking this path.
 */
export async function attachProviderCredentialUnchecked(
  input: AttachProviderCredentialUncheckedInput,
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
