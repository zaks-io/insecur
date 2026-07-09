import type {
  EnvironmentId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  UserId,
  VariableKey,
} from "@insecur/domain";
import type { SecretWriteDescriptiveVerdicts } from "@insecur/secret-store-contracts";

import type { SecretVersionLifecycleState } from "./lifecycle-states.js";

/**
 * Creating actor stamped on a Secret Version at write time (ADR-0017 §27). Only a User or Machine
 * Identity can author a Blind Secret Write; this is the authorization source of truth for who may
 * later discard the Draft Version.
 */
export type SecretVersionCreatorActor =
  | { readonly type: "user"; readonly userId: UserId }
  | { readonly type: "machine"; readonly machineIdentityId: MachineIdentityId };

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
  createdByActor: SecretVersionCreatorActor;
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
