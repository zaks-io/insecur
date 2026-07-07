import type { OperationId, OrganizationId, ProjectId } from "@insecur/domain";
import type { UserActorRef } from "@insecur/access";

import { requireAppConnectionChangeEvidence } from "./consume-app-connection-change-evidence.js";
import { recordConnectionCreateDenied } from "./record-connection-audit.js";

export async function runWithAppConnectionChangeEvidence<T>(input: {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly operationId: OperationId;
  readonly actor: UserActorRef;
  readonly run: () => Promise<T>;
}): Promise<T> {
  await requireAppConnectionChangeEvidence(
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      operationId: input.operationId,
      actor: input.actor,
    },
    async (error) => {
      await recordConnectionCreateDenied({
        actorUserId: input.actor.userId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        reasonCode: error.code,
      });
    },
  );

  return input.run();
}
