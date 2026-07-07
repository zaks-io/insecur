import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow, type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { queryTenantAuditEvents, type AuditEventsPage } from "@insecur/audit";
import type { ListAuditEventsRpcInput } from "@insecur/worker-kit";

export interface ListAuditEventsOperationInput {
  readonly input: ListAuditEventsRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

/**
 * Authorize-then-read for org audit events (INS-364): `metadata:detail_read` at the org coordinate
 * gates the read so metadata-viewer and other holders of the scope can query the tenant trail.
 */
export async function listAuditEventsOperation({
  input,
  auditActor,
  accessActor,
}: ListAuditEventsOperationInput): Promise<AuditEventsPage> {
  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate: { organizationId: input.organizationId },
    requiredScope: AUTHORIZATION_SCOPES.metadataDetailRead,
    requestId: input.requestId,
  });

  return queryTenantAuditEvents({
    organizationId: input.organizationId,
    ...(input.filters !== undefined ? { filters: input.filters } : {}),
    ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
    ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
  });
}
