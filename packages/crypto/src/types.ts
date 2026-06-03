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
