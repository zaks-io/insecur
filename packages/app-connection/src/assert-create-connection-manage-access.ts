import { auditAccessDenialOnFailure } from "@insecur/access";
import type { UserActorRef } from "@insecur/access";
import type { OrganizationId, ProjectId } from "@insecur/domain";

import {
  assertConnectionManageScope,
  isConnectionAccessDenied,
} from "./assert-connection-access.js";
import {
  recordConnectionCreateDenied,
  toConnectionAuditReasonCode,
} from "./record-connection-audit.js";

export async function assertCreateConnectionManageAccess(input: {
  readonly actor: UserActorRef;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
}): Promise<void> {
  try {
    await assertConnectionManageScope(input.actor, input.organizationId, input.projectId);
  } catch (error) {
    await auditAccessDenialOnFailure(error, {
      isAccessDenied: isConnectionAccessDenied,
      recordDenied: async () => {
        await recordConnectionCreateDenied({
          actorUserId: input.actor.userId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          reasonCode: toConnectionAuditReasonCode(error),
        });
      },
    });
    throw error;
  }
}
