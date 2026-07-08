import type { Keyring } from "@insecur/crypto";
import { type AppConnectionId, type OrganizationId, type ProjectId } from "@insecur/domain";
import type {
  AppConnectionRow,
  TenantAppConnectionStore,
  TenantSensitiveMetadataStore,
} from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import {
  assertConnectionReadyForValidation,
  recordConnectionValidationFailure,
} from "./connection-validation-helpers.js";
import { type MetadataSafeGitHubConnectionValidation } from "./create-github-app-connection.js";
import { type GitHubAppInstallationPort } from "./github-app-port.js";
import { toMetadataSafeGitHubValidation } from "./github-validation-projection.js";
import { persistGithubConnectionValidationSuccess } from "./persist-github-connection-validation-success.js";
import { runGithubConnectionValidationAccess } from "./run-github-connection-validation-access.js";
import { withGitHubConnectionReadAccess } from "./with-github-connection-access.js";

export interface ValidateGitHubAppConnectionInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly keyring: Keyring;
  readonly githubPort: GitHubAppInstallationPort;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

async function validateActiveGitHubConnection(
  input: ValidateGitHubAppConnectionInput,
  connection: AppConnectionRow,
  boundary: {
    installationId: string;
    owner: string;
    allowedRepositories: readonly string[];
  },
  providerAppRegistrationId: string,
): Promise<MetadataSafeGitHubConnectionValidation> {
  assertConnectionReadyForValidation(connection);
  const checkedAt = new Date();

  let validationResult;
  try {
    validationResult = await input.githubPort.verifyInstallation({
      ...boundary,
      providerAppRegistrationId,
    });
  } catch (error) {
    return recordConnectionValidationFailure({
      actorUserId: input.actor.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      appConnectionId: input.appConnectionId,
      checkedAt,
      appConnectionStore: input.appConnectionStore,
      error,
    });
  }

  await persistGithubConnectionValidationSuccess({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    checkedAt,
    validationResult,
    appConnectionStore: input.appConnectionStore,
  });

  return toMetadataSafeGitHubValidation(checkedAt, "success", null, validationResult);
}

export async function validateGitHubAppConnection(
  input: ValidateGitHubAppConnectionInput,
): Promise<MetadataSafeGitHubConnectionValidation> {
  return runGithubConnectionValidationAccess(
    input,
    withGitHubConnectionReadAccess,
    async (connection, metadata) =>
      validateActiveGitHubConnection(
        input,
        connection,
        metadata.boundary,
        metadata.linkage.providerAppRegistrationId,
      ),
  );
}
