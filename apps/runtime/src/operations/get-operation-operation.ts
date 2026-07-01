import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow, type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { getOperation, type OperationPollResult } from "@insecur/operations";
import type { GetOperationRpcInput } from "@insecur/worker-kit";

export interface GetOperationOperationInput {
  readonly input: GetOperationRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

/**
 * Authorize-then-read, atomic behind the seam: the org-read scope check that previously lived in the
 * API route now runs here, in the only deploy that can read the tenant store. Operation IDs are not
 * bearer authority (getOperation enforces nothing), so the scope gate must precede the read.
 */
export async function getOperationOperation({
  input,
  auditActor,
  accessActor,
}: GetOperationOperationInput): Promise<OperationPollResult> {
  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate: { organizationId: input.organizationId },
    requiredScope: AUTHORIZATION_SCOPES.organizationRead,
    requestId: input.requestId,
  });

  return getOperation({
    organizationId: input.organizationId,
    operationId: input.operationId,
  });
}
