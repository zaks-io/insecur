import type { Keyring } from "@insecur/crypto";
import {
  APP_CONNECTION_ERROR_CODES,
  AUTH_ERROR_CODES,
  type OperationId,
  type ProjectId,
} from "@insecur/domain";
import type { AppConnectionRow, TenantSensitiveMetadataStore } from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import { AppConnectionError } from "./app-connection-error.js";
import { requireAppConnectionChangeEvidence } from "./consume-app-connection-change-evidence.js";
import {
  attachProviderCredentialUnchecked,
  type AttachProviderCredentialUncheckedInput,
} from "./attach-provider-credential-unchecked.js";
import { recordConnectionCredentialAttachDenied } from "./record-connection-audit.js";
import { withConnectionManageAccess } from "./with-cloudflare-connection-access.js";

export interface AttachProviderCredentialInput extends AttachProviderCredentialUncheckedInput {
  readonly actor: UserActorRef;
  readonly projectId: ProjectId;
  readonly operationId: OperationId;
  readonly keyring: Keyring;
  readonly sensitiveMetadataStore: TenantSensitiveMetadataStore;
}

async function attachCredentialWithProjectBoundary(
  input: AttachProviderCredentialInput,
): Promise<AppConnectionRow> {
  try {
    return await withConnectionManageAccess({
      actor: input.actor,
      organizationId: input.organizationId,
      projectId: input.projectId,
      appConnectionId: input.appConnectionId,
      keyring: input.keyring,
      appConnectionStore: input.appConnectionStore,
      sensitiveMetadataStore: input.sensitiveMetadataStore,
      recordDenied: async () => {
        await recordConnectionCredentialAttachDenied({
          actorUserId: input.actor.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          appConnectionId: input.appConnectionId,
          reasonCode: AUTH_ERROR_CODES.insufficientScope,
        });
      },
      run: async () =>
        attachProviderCredentialUnchecked({
          organizationId: input.organizationId,
          appConnectionId: input.appConnectionId,
          credentialId: input.credentialId,
          wrapped: input.wrapped,
          appConnectionStore: input.appConnectionStore,
        }),
    });
  } catch (error) {
    if (error instanceof AppConnectionError && error.code === APP_CONNECTION_ERROR_CODES.notFound) {
      await recordConnectionCredentialAttachDenied({
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

/**
 * Attaches an encrypted Cloudflare provider credential and activates the app connection.
 * Requires cleared, operation-bound high-assurance evidence and project-scoped boundary
 * proof before activation.
 */
export async function attachProviderCredential(
  input: AttachProviderCredentialInput,
): Promise<AppConnectionRow> {
  await requireAppConnectionChangeEvidence(
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      operationId: input.operationId,
      actor: input.actor,
    },
    async (error) => {
      await recordConnectionCredentialAttachDenied({
        actorUserId: input.actor.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        appConnectionId: input.appConnectionId,
        reasonCode: error.code,
      });
    },
  );

  return attachCredentialWithProjectBoundary(input);
}
