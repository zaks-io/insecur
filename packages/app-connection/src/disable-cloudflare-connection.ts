import {
  APP_CONNECTION_ERROR_CODES,
  type AppConnectionId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import type { AppConnectionRow, TenantAppConnectionStore } from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import { AppConnectionError } from "./app-connection-error.js";
import {
  recordConnectionDisabled,
  recordConnectionDisableDenied,
} from "./record-connection-audit.js";
import { withConnectionManageAccess } from "./with-cloudflare-connection-access.js";

export interface DisableCloudflareConnectionInput {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly appConnectionId: AppConnectionId;
  readonly appConnectionStore: TenantAppConnectionStore;
}

export async function disableCloudflareConnection(
  input: DisableCloudflareConnectionInput,
): Promise<AppConnectionRow> {
  try {
    return await withConnectionManageAccess({
      ...input,
      recordDenied: async () => {
        await recordConnectionDisableDenied({
          actorUserId: input.actor.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          appConnectionId: input.appConnectionId,
          reasonCode: APP_CONNECTION_ERROR_CODES.notFound,
        });
      },
      run: async () => {
        const disabled = await input.appConnectionStore.updateConnectionStatus({
          organizationId: input.organizationId,
          appConnectionId: input.appConnectionId,
          status: "disconnected",
          statusReasonCode: APP_CONNECTION_ERROR_CODES.disconnected,
          activeCredentialId: null,
        });

        await recordConnectionDisabled({
          actorUserId: input.actor.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          appConnectionId: input.appConnectionId,
        });

        return disabled;
      },
    });
  } catch (error) {
    if (error instanceof AppConnectionError && error.code === APP_CONNECTION_ERROR_CODES.notFound) {
      await recordConnectionDisableDenied({
        actorUserId: input.actor.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        appConnectionId: input.appConnectionId,
        reasonCode: error.code,
      });
    }
    throw error;
  }
}
