import type { Keyring } from "@insecur/crypto";
import type { UserActorRef } from "@insecur/access";
import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type OrganizationId,
  type RequestId,
} from "@insecur/domain";

import { requireUserActorForConnectionCommand } from "./app-connection-change-gate.js";
import { AppConnectionError } from "./app-connection-error.js";
import { disableCloudflareConnection } from "./disable-cloudflare-connection.js";
import { disableGitHubConnection } from "./disable-github-connection.js";
import { withOrgAppConnectionKeyring } from "./load-org-app-connection.js";
import { toMetadataSafeAppConnectionStatus } from "./metadata-safe-connection-status.js";
import { orgScopedConnectionProjectId } from "./org-scoped-connection-project-id.js";

export interface DisconnectAppConnectionCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly requestId: RequestId;
  readonly keyring: Keyring;
}

export async function disconnectAppConnectionCommand(
  input: DisconnectAppConnectionCommandInput,
): Promise<{
  readonly connection: ReturnType<typeof toMetadataSafeAppConnectionStatus>;
  readonly auditEventId: string;
}> {
  const actor = requireUserActorForConnectionCommand(input.actor);
  const projectId = orgScopedConnectionProjectId();

  const disconnected = await withOrgAppConnectionKeyring(input, async (stores, connection) => {
    const scope = {
      actor,
      organizationId: input.organizationId,
      projectId,
      appConnectionId: input.appConnectionId,
      keyring: stores.keyring,
      appConnectionStore: stores.appConnectionStore,
      sensitiveMetadataStore: stores.sensitiveMetadataStore,
    };

    if (connection.provider === "cloudflare") {
      return disableCloudflareConnection(scope);
    }
    if (connection.provider === "github") {
      return disableGitHubConnection(scope);
    }

    throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.invalidConnectionMethod);
  });

  return {
    connection: toMetadataSafeAppConnectionStatus(disconnected.connection),
    auditEventId: disconnected.auditEventId,
  };
}
