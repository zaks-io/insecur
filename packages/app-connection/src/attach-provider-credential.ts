import type { OperationId, ProjectId } from "@insecur/domain";
import type { AppConnectionRow } from "@insecur/tenant-store";
import type { UserActorRef } from "@insecur/access";

import { requireAppConnectionChangeEvidence } from "./consume-app-connection-change-evidence.js";
import {
  attachProviderCredentialUnchecked,
  type AttachProviderCredentialUncheckedInput,
} from "./attach-provider-credential-unchecked.js";
import { recordConnectionCredentialAttachDenied } from "./record-connection-audit.js";

export interface AttachProviderCredentialInput extends AttachProviderCredentialUncheckedInput {
  readonly actor: UserActorRef;
  readonly projectId: ProjectId;
  readonly operationId: OperationId;
}

/**
 * Attaches an encrypted provider credential and activates the app connection.
 * Requires cleared, operation-bound high-assurance evidence for app connection change.
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

  return attachProviderCredentialUnchecked({
    organizationId: input.organizationId,
    appConnectionId: input.appConnectionId,
    credentialId: input.credentialId,
    wrapped: input.wrapped,
    appConnectionStore: input.appConnectionStore,
  });
}
