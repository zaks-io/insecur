import type { Keyring } from "@insecur/crypto";
import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import type { TenantSensitiveMetadataStore } from "@insecur/tenant-store";

import { AppConnectionError } from "./app-connection-error.js";
import { decryptGithubConnectionBoundaryForValidation } from "./decrypt-github-connection-boundary-for-validation.js";
import {
  GITHUB_BOUNDARY_FIELD_KEYS,
  GITHUB_CONNECTION_BOUNDARY_METADATA_TYPE,
  GITHUB_CONNECTION_LINKAGE_METADATA_TYPE,
  GITHUB_LINKAGE_FIELD_KEYS,
  githubConnectionRecordResourceId,
  parseAllowedRepositories,
  type GitHubConnectionBoundary,
  type GitHubConnectionLinkage,
} from "./github-app-metadata.js";

const textDecoder = new TextDecoder();

export interface LoadGitHubConnectionBoundaryInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly keyring: Keyring;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

export interface LoadedGitHubConnectionMetadata {
  readonly boundary: GitHubConnectionBoundary;
  readonly linkage: GitHubConnectionLinkage;
}

async function decryptMetadataField(
  input: LoadGitHubConnectionBoundaryInput,
  metadataType:
    | typeof GITHUB_CONNECTION_BOUNDARY_METADATA_TYPE
    | typeof GITHUB_CONNECTION_LINKAGE_METADATA_TYPE,
  fieldKey: string,
): Promise<string> {
  const recordResourceId = githubConnectionRecordResourceId(input.appConnectionId);
  const storedField = await input.sensitiveMetadataStore.getField({
    organizationId: input.organizationId,
    scopeProjectId: input.projectId,
    metadataType,
    recordResourceId,
    fieldKey,
  });
  if (!storedField) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.notFound);
  }

  const plaintext = await decryptGithubConnectionBoundaryForValidation(
    input.keyring,
    {
      organizationId: input.organizationId,
      scopeProjectId: input.projectId,
      metadataType,
      recordResourceId,
      fieldKey,
    },
    storedField.wrapped,
  );
  return textDecoder.decode(plaintext.unwrapUtf8());
}

export async function loadGitHubConnectionBoundary(
  input: LoadGitHubConnectionBoundaryInput,
): Promise<LoadedGitHubConnectionMetadata> {
  const [
    installationId,
    owner,
    allowedRepositoriesSerialized,
    providerAccountId,
    providerAppRegistrationId,
  ] = await Promise.all([
    decryptMetadataField(
      input,
      GITHUB_CONNECTION_BOUNDARY_METADATA_TYPE,
      GITHUB_BOUNDARY_FIELD_KEYS.installationId,
    ),
    decryptMetadataField(
      input,
      GITHUB_CONNECTION_BOUNDARY_METADATA_TYPE,
      GITHUB_BOUNDARY_FIELD_KEYS.owner,
    ),
    decryptMetadataField(
      input,
      GITHUB_CONNECTION_BOUNDARY_METADATA_TYPE,
      GITHUB_BOUNDARY_FIELD_KEYS.allowedRepositories,
    ),
    decryptMetadataField(
      input,
      GITHUB_CONNECTION_LINKAGE_METADATA_TYPE,
      GITHUB_LINKAGE_FIELD_KEYS.providerAccountId,
    ),
    decryptMetadataField(
      input,
      GITHUB_CONNECTION_LINKAGE_METADATA_TYPE,
      GITHUB_LINKAGE_FIELD_KEYS.providerAppRegistrationId,
    ),
  ]);

  return {
    boundary: {
      installationId,
      owner,
      allowedRepositories: parseAllowedRepositories(allowedRepositoriesSerialized),
    },
    linkage: {
      providerAccountId,
      providerAppRegistrationId,
    },
  };
}
