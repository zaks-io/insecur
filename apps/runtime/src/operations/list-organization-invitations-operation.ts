import { AUTHORIZATION_SCOPES, authorizeScopeOrThrow, type ActorRef } from "@insecur/access";
import type { AuditActorRef } from "@insecur/audit";
import { listPendingInvitations } from "@insecur/onboarding";
import { toIsoTimestamp } from "@insecur/tenant-store";
import type {
  ListOrganizationInvitationsRpcInput,
  ListOrganizationInvitationsRpcPayload,
} from "@insecur/worker-kit";

export interface ListOrganizationInvitationsOperationInput {
  readonly input: ListOrganizationInvitationsRpcInput;
  readonly auditActor: AuditActorRef;
  readonly accessActor: ActorRef;
}

/**
 * Authorize-then-read for the org pending-invitations register (INS-373): `organization:read` at
 * the org coordinate gates the read, matching the members read, so denial stays metadata-safe.
 * Invitations carry no token or acceptance secret; the payload is identifiers, role bundle,
 * status, and timestamps only.
 */
export async function listOrganizationInvitationsOperation({
  input,
  auditActor,
  accessActor,
}: ListOrganizationInvitationsOperationInput): Promise<ListOrganizationInvitationsRpcPayload> {
  await authorizeScopeOrThrow({
    actor: accessActor,
    auditActor,
    coordinate: { organizationId: input.organizationId },
    requiredScope: AUTHORIZATION_SCOPES.organizationRead,
    requestId: input.requestId,
  });

  const rows = await listPendingInvitations(input.organizationId);
  return {
    invitations: rows.map((row) => ({
      invitationId: row.invitationId,
      organizationId: row.organizationId,
      inviteeUserId: row.inviteeUserId,
      inviteeDisplayName: row.inviteeDisplayName,
      rolePreset: row.rolePreset,
      status: row.status,
      projectId: row.projectId,
      createdAt: toIsoTimestamp(row.createdAt),
    })),
  };
}
