import type { OperationId, RequestId } from "@insecur/domain";
import type { AuditCorrelationRefs, AuditOperationRef, AuditRequestRef } from "./audit-types.js";

export function auditRequestRef(requestId: RequestId): AuditRequestRef {
  return { requestId };
}

export function auditOperationRef(operationId: OperationId): AuditOperationRef {
  return { operationId };
}

/** Builds correlation refs from optional request and operation identifiers. */
export function auditCorrelationRefs(
  input: Partial<{ requestId: RequestId; operationId: OperationId }>,
): AuditCorrelationRefs {
  const refs: AuditCorrelationRefs = {};
  if (input.requestId !== undefined) {
    refs.request = auditRequestRef(input.requestId);
  }
  if (input.operationId !== undefined) {
    refs.operation = auditOperationRef(input.operationId);
  }
  return refs;
}
