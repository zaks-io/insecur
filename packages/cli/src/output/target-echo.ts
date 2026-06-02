import type {
  MetadataEnvelopeMeta,
  OpaqueResourceId,
  RequestId,
  ResolvedTargetEcho,
} from "@insecur/domain";

export function asEchoId(id: string): OpaqueResourceId {
  return id as OpaqueResourceId;
}

export function buildEnvelopeMeta(input: {
  readonly requestId?: RequestId | undefined;
  readonly resolvedTargets?: readonly ResolvedTargetEcho[];
}): MetadataEnvelopeMeta | undefined {
  if (input.requestId === undefined && input.resolvedTargets === undefined) {
    return undefined;
  }
  return {
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    ...(input.resolvedTargets !== undefined ? { resolvedTargets: input.resolvedTargets } : {}),
  };
}
