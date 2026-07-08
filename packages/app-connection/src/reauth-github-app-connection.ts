import type { Keyring } from "@insecur/crypto";
import type { UserActorRef } from "@insecur/access";
import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type OperationId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";

import { AppConnectionError } from "./app-connection-error.js";
import { createGitHubAppInstallationPort } from "./github-app-port.js";
import { loadGitHubConnectionBoundary } from "./load-github-connection-boundary.js";
import type { OrgAppConnectionStores } from "./load-org-app-connection.js";
import type { MetadataSafeGitHubConnectionValidation } from "./create-github-app-connection.js";
import { toMetadataSafeAppConnectionStatus } from "./metadata-safe-connection-status.js";
import { updateGitHubAppConnection } from "./update-github-app-connection.js";
import { orgScopedConnectionProjectId } from "./org-scoped-connection-project-id.js";
import type { AppConnectionRow } from "@insecur/tenant-store";

async function resolveGitHubReauthBoundary(input: {
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly githubBoundary?: {
    readonly installationId: string;
    readonly owner: string;
    readonly allowedRepositories: readonly string[];
  };
  readonly stores: OrgAppConnectionStores & { readonly keyring: Keyring };
}) {
  if (input.githubBoundary !== undefined) {
    return input.githubBoundary;
  }
  return (
    await loadGitHubConnectionBoundary({
      organizationId: input.organizationId,
      projectId: orgScopedConnectionProjectId(),
      appConnectionId: input.appConnectionId,
      keyring: input.stores.keyring,
      sensitiveMetadataStore: input.stores.sensitiveMetadataStore,
    })
  ).boundary;
}

export async function reauthGitHubAppConnection(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly projectId: ProjectId;
  readonly operationId: OperationId;
  readonly githubBoundary?: {
    readonly installationId: string;
    readonly owner: string;
    readonly allowedRepositories: readonly string[];
  };
  readonly keyring: Keyring;
  readonly stores: OrgAppConnectionStores & { readonly keyring: Keyring };
  readonly connection: AppConnectionRow;
}): Promise<{
  readonly connection: ReturnType<typeof toMetadataSafeAppConnectionStatus>;
  readonly validation: MetadataSafeGitHubConnectionValidation;
}> {
  if (
    input.connection.provider !== "github" ||
    input.connection.connectionMethod !== "github-app"
  ) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.invalidConnectionMethod);
  }

  const boundary = await resolveGitHubReauthBoundary(input);

  const validation = await updateGitHubAppConnection({
    actor: input.actor,
    organizationId: input.organizationId,
    projectId: input.projectId,
    operationId: input.operationId,
    appConnectionId: input.appConnectionId,
    boundary,
    keyring: input.keyring,
    githubPort: createGitHubAppInstallationPort(),
    appConnectionStore: input.stores.appConnectionStore,
    sensitiveMetadataStore: input.stores.sensitiveMetadataStore,
  });

  const updated = await input.stores.appConnectionStore.getConnectionById(
    input.organizationId,
    input.appConnectionId,
  );
  if (!updated) {
    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.notFound);
  }

  return {
    connection: toMetadataSafeAppConnectionStatus(updated),
    validation,
  };
}
