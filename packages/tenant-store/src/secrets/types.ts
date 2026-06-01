import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";

/** Wrapped material accepted by the Secret Version Store (plaintext-free). */
export interface StoredWrappedSecretMaterial {
  organizationDataKeyVersion: number;
  projectDataKeyVersion: number;
  ciphertext: Uint8Array;
}

export interface SecretVersionStoreRow {
  secretVersionId: SecretVersionId;
  secretId: SecretId;
  versionNumber: number;
  organizationDataKeyVersion: number;
  projectDataKeyVersion: number;
  wrapped: StoredWrappedSecretMaterial;
}

export interface ResolveSecretForWriteInput {
  organizationId: OrganizationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  variableKey: VariableKey;
  /** When omitted, create-or-update resolves by Variable Key or server-mints an ID. */
  secretId?: SecretId;
}

export interface AppendSecretVersionAndMakeLiveInput {
  organizationId: OrganizationId;
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  wrapped: StoredWrappedSecretMaterial;
  createdSecretShape: boolean;
}

export interface AppendSecretVersionAndMakeLiveResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  versionNumber: number;
  createdSecretShape: boolean;
}
