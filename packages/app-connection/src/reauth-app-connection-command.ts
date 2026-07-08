import type { Keyring } from "@insecur/crypto";
import type { UserActorRef } from "@insecur/access";
import {
  type AppConnectionId,
  type OperationId,
  type OrganizationId,
  type RequestId,
} from "@insecur/domain";

import { beginAppConnectionChangeCommand } from "./app-connection-change-gate.js";
import { withOrgAppConnectionKeyring } from "./load-org-app-connection.js";
import type { MetadataSafeGitHubConnectionValidation } from "./create-github-app-connection.js";
import { reauthGitHubAppConnection } from "./reauth-github-app-connection.js";
import { toMetadataSafeAppConnectionStatus } from "./metadata-safe-connection-status.js";

export interface ReauthAppConnectionCommandInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly operationId?: OperationId;
  readonly requestId: RequestId;
  readonly githubBoundary?: {
    readonly installationId: string;
    readonly owner: string;
    readonly allowedRepositories: readonly string[];
  };
  readonly keyring: Keyring;
}

export async function reauthAppConnectionCommand(input: ReauthAppConnectionCommandInput): Promise<{
  readonly connection: ReturnType<typeof toMetadataSafeAppConnectionStatus>;
  readonly validation: MetadataSafeGitHubConnectionValidation;
  readonly auditEventId: string;
}> {
  const { actor, gate } = await beginAppConnectionChangeCommand(input);

  return withOrgAppConnectionKeyring(input, async (stores, connection) =>
    reauthGitHubAppConnection({
      actor,
      organizationId: input.organizationId,
      appConnectionId: input.appConnectionId,
      projectId: gate.projectId,
      operationId: gate.operationId,
      keyring: input.keyring,
      stores,
      connection,
      ...(input.githubBoundary === undefined ? {} : { githubBoundary: input.githubBoundary }),
    }),
  );
}
