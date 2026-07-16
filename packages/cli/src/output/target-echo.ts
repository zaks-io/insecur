import type {
  MetadataEnvelopeMeta,
  OpaqueResourceId,
  OperationId,
  RequestId,
  ResolvedTargetEcho,
} from "@insecur/domain";

export function asEchoId(id: string): OpaqueResourceId {
  return id as OpaqueResourceId;
}

export function buildEnvelopeMeta(input: {
  readonly requestId?: RequestId | undefined;
  readonly operationId?: OperationId | undefined;
  readonly resolvedTargets?: readonly ResolvedTargetEcho[];
}): MetadataEnvelopeMeta | undefined {
  if (
    input.requestId === undefined &&
    input.operationId === undefined &&
    input.resolvedTargets === undefined
  ) {
    return undefined;
  }
  return {
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    ...(input.operationId !== undefined ? { operationId: input.operationId } : {}),
    ...(input.resolvedTargets !== undefined ? { resolvedTargets: input.resolvedTargets } : {}),
  };
}
