import type { ProviderAppRegistrationRow } from "@insecur/tenant-store";

export interface MetadataSafeProviderAppRegistrationStatus {
  readonly id: ProviderAppRegistrationRow["id"];
  readonly instanceId: string;
  readonly provider: ProviderAppRegistrationRow["provider"];
  readonly connectionMethod: ProviderAppRegistrationRow["connectionMethod"];
  readonly clientId: string;
  readonly callbackPath: string;
  readonly status: ProviderAppRegistrationRow["status"];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toMetadataSafeProviderAppRegistrationStatus(
  registration: ProviderAppRegistrationRow,
): MetadataSafeProviderAppRegistrationStatus {
  return {
    id: registration.id,
    instanceId: registration.instanceId,
    provider: registration.provider,
    connectionMethod: registration.connectionMethod,
    clientId: registration.clientId,
    callbackPath: registration.callbackPath,
    status: registration.status,
    createdAt: registration.createdAt.toISOString(),
    updatedAt: registration.updatedAt.toISOString(),
  };
}
