import {
  AUTHORIZATION_SCOPES,
  authorizeScopeOrThrow,
  loadOrganizationMembers,
  type ActorRef,
} from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { toIsoTimestamp } from "@insecur/tenant-store";
import type {
  ListOrganizationMembersRpcInput,
  ListOrganizationMembersRpcPayload,
} from "@insecur/worker-kit";

export interface ListOrganizationMembersOperationInput {
  readonly input: ListOrganizationMembersRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

/**
 * Authorize-then-read for the org members register (INS-373): `organization:read` at the org
 * coordinate gates the read, so a non-member denial is indistinguishable from a member lacking
 * the scope. The payload is metadata-only (identifiers, role bundle, timestamps).
 */
export async function listOrganizationMembersOperation({
  input,
  auditActor,
  accessActor,
}: ListOrganizationMembersOperationInput): Promise<ListOrganizationMembersRpcPayload> {
  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate: { organizationId: input.organizationId },
    requiredScope: AUTHORIZATION_SCOPES.organizationRead,
    requestId: input.requestId,
  });

  const rows = await loadOrganizationMembers(input.organizationId);
  return {
    members: rows.map((row) => ({
      membershipId: row.membershipId,
      organizationId: row.organizationId,
      userId: row.userId,
      displayName: row.displayName,
      rolePreset: row.rolePreset,
      projectId: row.projectId,
      createdAt: toIsoTimestamp(row.createdAt),
    })),
  };
}
