import type { Keyring } from "@insecur/crypto";
import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import type { TenantAppConnectionStore, TenantSensitiveMetadataStore } from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import { AppConnectionError } from "./app-connection-error.js";
import type { GitHubConnectionBoundary } from "./github-app-metadata.js";
import type { GitHubAppInstallationPort } from "./github-app-port.js";
import { type MetadataSafeGitHubConnectionValidation } from "./create-github-app-connection.js";
import { persistGithubConnectionValidationSuccess } from "./persist-github-connection-validation-success.js";
import { runWithAppConnectionChangeEvidence } from "./run-with-app-connection-change-evidence.js";
import { runGithubConnectionValidationAccess } from "./run-github-connection-validation-access.js";
import { storeGitHubConnectionBoundary } from "./store-github-connection-boundary.js";
import { verifyGitHubInstallation } from "./verify-github-installation.js";
import { toMetadataSafeGitHubValidation } from "./github-validation-projection.js";
import { withGitHubConnectionManageAccess } from "./with-github-connection-access.js";

export interface UpdateGitHubAppConnectionInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly operationId: OperationId;
  readonly appConnectionId: AppConnectionId;
  readonly boundary: GitHubConnectionBoundary;
  readonly keyring: Keyring;
  readonly githubPort: GitHubAppInstallationPort;
  readonly appConnectionStore: TenantAppConnectionStore;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

async function updateActiveGitHubConnection(
  input: UpdateGitHubAppConnectionInput,
  providerAppRegistrationId: string,
): Promise<MetadataSafeGitHubConnectionValidation> {
  const validationResult = await verifyGitHubInstallation({
    actorUserId: input.actor.userId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    boundary: input.boundary,
    providerAppRegistrationId,
    githubPort: input.githubPort,
  });

  await storeGitHubConnectionBoundary({
    organizationId: input.organizationId,
    projectId: input.projectId,
    appConnectionId: input.appConnectionId,
    boundary: input.boundary,
    linkage: {
      providerAccountId: input.boundary.owner,
      providerAppRegistrationId,
    },
    keyring: input.keyring,
    sensitiveMetadataStore: input.sensitiveMetadataStore,
  });

  const checkedAt = new Date();
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

export async function updateGitHubAppConnection(
  input: UpdateGitHubAppConnectionInput,
): Promise<MetadataSafeGitHubConnectionValidation> {
  return runWithAppConnectionChangeEvidence({
    organizationId: input.organizationId,
    projectId: input.projectId,
    operationId: input.operationId,
    actor: input.actor,
    run: () =>
      runGithubConnectionValidationAccess(
        input,
        withGitHubConnectionManageAccess,
        async (connection, metadata) => {
          if (connection.status === "disconnected") {
            throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.disconnected);
          }
          return updateActiveGitHubConnection(input, metadata.linkage.providerAppRegistrationId);
        },
      ),
  });
}
