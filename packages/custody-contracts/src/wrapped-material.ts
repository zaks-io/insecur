import type {
  AppConnectionId,
  EnvironmentId,
  OpaqueResourceId,
  OrganizationId,
  ProjectId,
  ProviderCredentialId,
  SecretId,
} from "@insecur/domain";

/** Identity binding for ciphertext (Opaque Resource IDs only). */
export interface SecretCiphertextIdentity {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  secretId: SecretId;
}

/** Provider connection method stable code (for example `github-app`). */
export type ProviderConnectionMethod = string;

/** Identity binding for Provider Credential ciphertext (ADR-0005). */
export interface ProviderCredentialCiphertextIdentity {
  organizationId: OrganizationId;
  appConnectionId: AppConnectionId;
  provider: ProviderConnectionMethod;
  credentialId: ProviderCredentialId;
}

/** Stable Sensitive Metadata type code (for example `approval.context_note`). */
export type SensitiveMetadataType = string;

/** Stable Sensitive Metadata field key within a record. */
export type SensitiveMetadataFieldKey = string;

/** Identity binding for Sensitive Metadata ciphertext (ADR-0005). */
export interface SensitiveMetadataCiphertextIdentity {
  organizationId: OrganizationId;
  /** Project id when project-scoped; empty string when organization-scoped. */
  scopeProjectId: ProjectId | "";
  metadataType: SensitiveMetadataType;
  recordResourceId: OpaqueResourceId;
  fieldKey: SensitiveMetadataFieldKey;
}

export type StoreFacingCiphertext = Uint8Array;

/** Wrapped material returned to callers; never plaintext at rest. */
export interface WrappedSecretValue {
  organizationDataKeyVersion: number;
  projectDataKeyVersion: number;
  ciphertext: Uint8Array;
  /**
   * Optional encrypt-path echo. Persisted Secret Version rows store only
   * key-version columns and ciphertext bytes.
   */
  identity?: SecretCiphertextIdentity;
}

export interface WrappedProviderCredential {
  organizationDataKeyVersion: number;
  ciphertext: Uint8Array;
  identity?: ProviderCredentialCiphertextIdentity;
}

export interface WrappedSensitiveMetadata {
  organizationDataKeyVersion: number;
  projectDataKeyVersion: number | null;
  ciphertext: Uint8Array;
  identity?: SensitiveMetadataCiphertextIdentity;
}

/** Bytes persisted by metadata stores (no caller identity echo). */
export function toStoreFacingCiphertext(wrapped: {
  ciphertext: Uint8Array;
}): StoreFacingCiphertext {
  return wrapped.ciphertext;
}
