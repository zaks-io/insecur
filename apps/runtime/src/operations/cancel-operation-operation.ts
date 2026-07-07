import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow, type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { recordOperationCancelDenied, recordOperationCanceled } from "@insecur/audit";
import {
  cancelOperation,
  OperationStoreError,
  type OperationPollResult,
} from "@insecur/operations";
import type { CancelOperationRpcInput, CancelOperationRpcPayload } from "@insecur/worker-kit";

export interface CancelOperationOperationInput {
  readonly input: CancelOperationRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

function toCancelPayload(
  operation: OperationPollResult,
  auditEventId: string,
): CancelOperationRpcPayload {
  return {
    operationId: operation.operationId,
    organizationId: operation.organizationId,
    state: operation.state,
    intentCode: operation.intentCode,
    progress: { ...operation.progress },
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    auditEventId,
  };
}

/**
 * Authorize-then-cancel, atomic behind the seam: org-read scope gates cancel, matching operation
 * poll reads, then cancelOperation closes cancelable operations with an audit trail.
 */
export async function cancelOperationOperation({
  input,
  auditActor,
  accessActor,
}: CancelOperationOperationInput): Promise<CancelOperationRpcPayload> {
  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate: { organizationId: input.organizationId },
    requiredScope: AUTHORIZATION_SCOPES.organizationRead,
    requestId: input.requestId,
  });

  try {
    const mutation = await cancelOperation({
      organizationId: input.organizationId,
      operationId: input.operationId,
    });
    const audit = await recordOperationCanceled({
      actor: auditActor,
      organizationId: input.organizationId,
      operationId: input.operationId,
      request: { requestId: input.requestId },
    });
    return toCancelPayload(mutation.operation, audit.auditEventId);
  } catch (error) {
    if (error instanceof OperationStoreError) {
      await recordOperationCancelDenied({
        actor: auditActor,
        organizationId: input.organizationId,
        operationId: input.operationId,
        request: { requestId: input.requestId },
        reasonCode: error.code,
      });
    }
    throw error;
  }
}
