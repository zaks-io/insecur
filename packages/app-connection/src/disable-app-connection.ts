import { APP_CONNECTION_ERROR_CODES, AUTH_ERROR_CODES } from "@insecur/domain";
import type { AppConnectionRow } from "@insecur/tenant-store";

import { AppConnectionError } from "./app-connection-error.js";
import {
  recordConnectionDisabled,
  recordConnectionDisableDenied,
} from "./record-connection-audit.js";
import type { ConnectionOperationScope } from "./with-connection-access.js";

export interface DisableAppConnectionInput extends ConnectionOperationScope {
  readonly clearActiveCredential?: boolean;
}

type DisableConnectionRun = (
  connection: AppConnectionRow,
  metadata: unknown,
) => Promise<AppConnectionRow>;

async function auditDisableNotFound(
  input: DisableAppConnectionInput,
  error: unknown,
): Promise<void> {
  if (error instanceof AppConnectionError && error.code === APP_CONNECTION_ERROR_CODES.notFound) {
    await recordConnectionDisableDenied({
      actorUserId: input.actor.userId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      appConnectionId: input.appConnectionId,
      reasonCode: error.code,
    });
  }
}

export async function disableAppConnection(
  input: DisableAppConnectionInput,
  withManageAccess: (
    scope: ConnectionOperationScope & {
      readonly recordDenied: () => Promise<void>;
      readonly run: DisableConnectionRun;
    },
  ) => Promise<AppConnectionRow>,
): Promise<AppConnectionRow> {
  try {
    return await withManageAccess({
      ...input,
      recordDenied: async () => {
        await recordConnectionDisableDenied({
          actorUserId: input.actor.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          appConnectionId: input.appConnectionId,
          reasonCode: AUTH_ERROR_CODES.insufficientScope,
        });
      },
      run: async () => {
        const disabled = await input.appConnectionStore.updateConnectionStatus({
          organizationId: input.organizationId,
          appConnectionId: input.appConnectionId,
          status: "disconnected",
          statusReasonCode: APP_CONNECTION_ERROR_CODES.disconnected,
          ...(input.clearActiveCredential === true ? { activeCredentialId: null } : {}),
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
    await auditDisableNotFound(input, error);
    throw error;
  }
}
