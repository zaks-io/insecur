import type { AppConnectionId, OrganizationId, ProviderCredentialId } from "@insecur/domain";
import type {
  ProviderConnectionMethod,
  WrappedProviderCredential,
} from "@insecur/custody-contracts";

export interface UpsertProviderCredentialInput {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly provider: ProviderConnectionMethod;
  readonly credentialId: ProviderCredentialId;
  readonly wrapped: WrappedProviderCredential;
}

export interface StoredWrappedProviderCredential {
  readonly organizationDataKeyVersion: number;
  readonly ciphertext: Uint8Array;
}

export interface ProviderCredentialRow {
  readonly id: ProviderCredentialId;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly provider: ProviderConnectionMethod;
  readonly wrapped: StoredWrappedProviderCredential;
}
