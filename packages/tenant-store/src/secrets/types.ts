import type {
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import type { SecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";

import type { SecretVersionLifecycleState } from "./lifecycle-states.js";

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
  lifecycleState: SecretVersionLifecycleState;
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

interface AppendSecretVersionInput {
  organizationId: OrganizationId;
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  wrapped: StoredWrappedSecretMaterial;
  createdSecretShape: boolean;
  descriptiveVerdicts: SecretWriteDescriptiveVerdicts;
}

export interface AppendSecretVersionResult {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  versionNumber: number;
  lifecycleState: SecretVersionLifecycleState;
  createdSecretShape: boolean;
  descriptiveVerdicts: SecretWriteDescriptiveVerdicts;
}

export type AppendSecretVersionAndMakeLiveInput = AppendSecretVersionInput;
export type AppendSecretVersionAndMakeLiveResult = AppendSecretVersionResult;

export type AppendSecretVersionAsDraftInput = AppendSecretVersionInput;
export type AppendSecretVersionAsDraftResult = AppendSecretVersionResult;

export interface PublishSecretVersionTarget {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
}

export interface PublishSecretVersionsInput {
  organizationId: OrganizationId;
  targets: readonly PublishSecretVersionTarget[];
}

export interface PublishSecretVersionsResult {
  published: readonly AppendSecretVersionResult[];
}

export interface ListDraftVersionsInput {
  organizationId: OrganizationId;
  environmentId: EnvironmentId;
  secretId?: SecretId;
}

export interface DraftVersionMetadataRow {
  secretId: SecretId;
  secretVersionId: SecretVersionId;
  versionNumber: number;
  variableKey: VariableKey;
}
