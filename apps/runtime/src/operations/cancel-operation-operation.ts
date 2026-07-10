import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow, type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { recordOperationCancelDenied, recordOperationCanceledInTenantScope } from "@insecur/audit";
import {
  cancelOperationInTenantScope,
  OperationStoreError,
  type OperationPollResult,
} from "@insecur/operations";
import { withTenantScope } from "@insecur/tenant-store";
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
 * Authorize-then-cancel: the dedicated mutation scope is intentionally distinct from operation
 * polling so read-only members cannot change operation state.
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
    requiredScope: AUTHORIZATION_SCOPES.operationCancel,
    requestId: input.requestId,
  });

  try {
    const { mutation, audit } = await withTenantScope(
      { kind: "organization", organizationId: input.organizationId },
      async ({ sql }) => {
        const mutation = await cancelOperationInTenantScope(sql, {
          organizationId: input.organizationId,
          operationId: input.operationId,
        });
        const audit = await recordOperationCanceledInTenantScope(sql, {
          actor: auditActor,
          organizationId: input.organizationId,
          operationId: input.operationId,
          request: { requestId: input.requestId },
        });
        return { mutation, audit };
      },
    );
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
