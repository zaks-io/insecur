import { secretVersionId } from "@insecur/domain";

import { assertProtectedEnvironment } from "./assert-protected-environment.js";
import { assertSecretProtectedMutationAccess } from "./assert-secret-protected-mutation-access.js";
import { gateProtectedSecretMutation } from "./gate-protected-secret-mutation.js";
import { noopHighAssuranceDenied } from "./noop-high-assurance-denied.js";
import type {
  RequestProtectedRollbackInput,
  RequestProtectedRollbackResult,
} from "./request-protected-rollback-types.js";
import { copyRollbackVersion, maybeCreateRollbackApprovalRequest } from "./rollback-helpers.js";

export type {
  RequestProtectedRollbackInput,
  RequestProtectedRollbackResult,
} from "./request-protected-rollback-types.js";

export async function requestProtectedRollback(
  input: RequestProtectedRollbackInput,
): Promise<RequestProtectedRollbackResult> {
  const scope = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
  };
  await assertProtectedEnvironment(input.organizationId, input.environmentId);
  await assertSecretProtectedMutationAccess(input.actor, scope);

  const gate = await gateProtectedSecretMutation({
    ...scope,
    actorUserId: input.actor.userId,
    mutationKind: "rollback",
    requestId: input.requestId,
    onDenied: noopHighAssuranceDenied,
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
  });

  const newSecretVersionId = secretVersionId.generate();
  const copied = await copyRollbackVersion({
    organizationId: input.organizationId,
    secretId: input.secretId,
    toVersionNumber: input.toVersionNumber,
    newSecretVersionId,
    asDraft: input.promoteRequested,
  });

  const createdApprovalRequestId = await maybeCreateRollbackApprovalRequest(
    input,
    scope,
    newSecretVersionId,
    gate.operationId,
  );

  return {
    secretId: copied.secretId,
    secretVersionId: copied.secretVersionId,
    versionNumber: copied.versionNumber,
    lifecycleState: copied.lifecycleState,
    ...(createdApprovalRequestId !== undefined
      ? { approvalRequestId: createdApprovalRequestId }
      : {}),
    ...(gate.operationId !== undefined ? { operationId: gate.operationId } : {}),
  };
}
