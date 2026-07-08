import type { Keyring } from "@insecur/crypto";
import type { UserActorRef } from "@insecur/access";
import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type OrganizationId,
} from "@insecur/domain";

import { AppConnectionError } from "./app-connection-error.js";
import { assertConnectionReadScope } from "./assert-connection-access.js";
import type { MetadataSafeCloudflareConnectionValidation } from "./create-cloudflare-scoped-token-connection.js";
import type { MetadataSafeGitHubConnectionValidation } from "./create-github-app-connection.js";
import { loadCloudflareConnectionBoundary } from "./load-cloudflare-connection-boundary.js";
import { loadGitHubConnectionBoundary } from "./load-github-connection-boundary.js";
import { withOrgAppConnectionKeyring } from "./load-org-app-connection.js";
import { toMetadataSafeCloudflareConnectionStatus } from "./metadata-safe-cloudflare-connection-status.js";
import { toMetadataSafeGitHubConnectionStatus } from "./metadata-safe-github-connection-status.js";
import { orgScopedConnectionProjectId } from "./org-scoped-connection-project-id.js";

export interface AppConnectionStatusResult {
  readonly connection: ReturnType<typeof toMetadataSafeCloudflareConnectionStatus>["connection"];
  readonly validation:
    MetadataSafeCloudflareConnectionValidation | MetadataSafeGitHubConnectionValidation | null;
  readonly cloudflareBoundary: {
    readonly allowedAccountId: string;
    readonly allowedWorkerScript: string;
  } | null;
  readonly githubBoundary: {
    readonly installationId: string;
    readonly owner: string;
    readonly allowedRepositoryCount: number;
  } | null;
}

export async function getAppConnectionStatusCommand(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly keyring: Keyring;
}): Promise<AppConnectionStatusResult> {
  await assertConnectionReadScope(input.actor, input.organizationId);
  const projectId = orgScopedConnectionProjectId();

  return withOrgAppConnectionKeyring(input, async (stores, connection) => {
    const scope = {
      organizationId: input.organizationId,
      projectId,
      appConnectionId: input.appConnectionId,
      keyring: stores.keyring,
      sensitiveMetadataStore: stores.sensitiveMetadataStore,
    };

    if (connection.provider === "cloudflare") {
      const boundary = await loadCloudflareConnectionBoundary(scope);
      const projected = toMetadataSafeCloudflareConnectionStatus(connection);
      return {
        connection: projected.connection,
        validation: projected.validation,
        cloudflareBoundary: boundary,
        githubBoundary: null,
      };
    }

    if (connection.provider === "github") {
      const metadata = await loadGitHubConnectionBoundary(scope);
      const projected = toMetadataSafeGitHubConnectionStatus(connection);
      return {
        connection: projected.connection,
        validation: projected.validation,
        cloudflareBoundary: null,
        githubBoundary: {
          installationId: metadata.boundary.installationId,
          owner: metadata.boundary.owner,
          allowedRepositoryCount: metadata.boundary.allowedRepositories.length,
        },
      };
    }

    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.invalidConnectionMethod);
  });
}
