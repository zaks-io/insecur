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
import { withOrgAppConnectionKeyring } from "./load-org-app-connection.js";
import { toMetadataSafeCloudflareConnectionStatus } from "./metadata-safe-cloudflare-connection-status.js";
import { toMetadataSafeGitHubConnectionStatus } from "./metadata-safe-github-connection-status.js";

export interface AppConnectionStatusResult {
  readonly connection: ReturnType<typeof toMetadataSafeCloudflareConnectionStatus>["connection"];
  readonly validation:
    MetadataSafeCloudflareConnectionValidation | MetadataSafeGitHubConnectionValidation | null;
}

export async function getAppConnectionStatusCommand(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly appConnectionId: AppConnectionId;
  readonly keyring: Keyring;
}): Promise<AppConnectionStatusResult> {
  await assertConnectionReadScope(input.actor, input.organizationId);

  return withOrgAppConnectionKeyring(
    input,
    (_stores, connection): Promise<AppConnectionStatusResult> => {
      if (connection.provider === "cloudflare") {
        const projected = toMetadataSafeCloudflareConnectionStatus(connection);
        return Promise.resolve({
          connection: projected.connection,
          validation: projected.validation,
        });
      }

      if (connection.provider === "github") {
        const projected = toMetadataSafeGitHubConnectionStatus(connection);
        return Promise.resolve({
          connection: projected.connection,
          validation: projected.validation,
        });
      }

      throw new AppConnectionError(APP_CONNECTION_ERROR_CODES.invalidConnectionMethod);
    },
  );
}
