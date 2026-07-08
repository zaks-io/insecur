import { SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL, type Keyring } from "@insecur/crypto";
import type { AppConnectionId, OrganizationId, ProjectId } from "@insecur/domain";
import type { TenantSensitiveMetadataStore } from "@insecur/tenant-store";

import {
  GITHUB_BOUNDARY_FIELD_KEYS,
  GITHUB_CONNECTION_BOUNDARY_METADATA_TYPE,
  GITHUB_CONNECTION_LINKAGE_METADATA_TYPE,
  GITHUB_LINKAGE_FIELD_KEYS,
  githubConnectionRecordResourceId,
  serializeAllowedRepositories,
  type GitHubConnectionBoundary,
  type GitHubConnectionLinkage,
} from "./github-app-metadata.js";
import { upsertEncryptedMetadataField } from "./upsert-encrypted-metadata-field.js";

export interface StoreGitHubConnectionBoundaryInput {
  readonly organizationId: OrganizationId;
  readonly projectId?: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly boundary: GitHubConnectionBoundary;
  readonly linkage: GitHubConnectionLinkage;
  readonly keyring: Keyring;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

export async function storeGitHubConnectionBoundary(
  input: StoreGitHubConnectionBoundaryInput,
): Promise<void> {
  const scopeProjectId: ProjectId | "" =
    input.projectId ?? SENSITIVE_METADATA_ORG_SCOPE_PROJECT_SENTINEL;
  const recordResourceId = githubConnectionRecordResourceId(input.appConnectionId);
  const shared = {
    organizationId: input.organizationId,
    scopeProjectId,
    recordResourceId,
    keyring: input.keyring,
    sensitiveMetadataStore: input.sensitiveMetadataStore,
  };

  await upsertEncryptedMetadataField({
    ...shared,
    metadataType: GITHUB_CONNECTION_BOUNDARY_METADATA_TYPE,
    fieldKey: GITHUB_BOUNDARY_FIELD_KEYS.installationId,
    plaintext: input.boundary.installationId,
  });
  await upsertEncryptedMetadataField({
    ...shared,
    metadataType: GITHUB_CONNECTION_BOUNDARY_METADATA_TYPE,
    fieldKey: GITHUB_BOUNDARY_FIELD_KEYS.owner,
    plaintext: input.boundary.owner,
  });
  await upsertEncryptedMetadataField({
    ...shared,
    metadataType: GITHUB_CONNECTION_BOUNDARY_METADATA_TYPE,
    fieldKey: GITHUB_BOUNDARY_FIELD_KEYS.allowedRepositories,
    plaintext: serializeAllowedRepositories(input.boundary.allowedRepositories),
  });
  await upsertEncryptedMetadataField({
    ...shared,
    metadataType: GITHUB_CONNECTION_LINKAGE_METADATA_TYPE,
    fieldKey: GITHUB_LINKAGE_FIELD_KEYS.providerAccountId,
    plaintext: input.linkage.providerAccountId,
  });
  await upsertEncryptedMetadataField({
    ...shared,
    metadataType: GITHUB_CONNECTION_LINKAGE_METADATA_TYPE,
    fieldKey: GITHUB_LINKAGE_FIELD_KEYS.providerAppRegistrationId,
    plaintext: input.linkage.providerAppRegistrationId,
  });
}
