import type {
  InvitationId,
  MembershipId,
  OrganizationId,
  ProjectId,
  TeamId,
  UserId,
} from "@insecur/domain";
import type { BuiltInRolePreset } from "@insecur/access";
import type { AuditRequestRef } from "@insecur/audit";
import type { UserActorRef } from "@insecur/access";

export interface CreateInvitationInput {
  actor: UserActorRef;
  organizationId: OrganizationId;
  inviteeUserId: UserId;
  /** Validated at runtime with built-in role preset rules before persistence. */
  rolePreset: string;
  /** When set, the invitation grants a project-scoped membership. */
  projectId?: ProjectId;
  invitationId?: InvitationId;
  membershipId?: MembershipId;
  request?: AuditRequestRef;
}

export interface CreateInvitationResult {
  invitationId: InvitationId;
  organizationId: OrganizationId;
  teamId: TeamId;
  inviteeUserId: UserId;
  rolePreset: BuiltInRolePreset;
  projectId: ProjectId | null;
}

export interface AcceptInvitationInput {
  invitationId: InvitationId;
  organizationId: OrganizationId;
  acceptingUserId: UserId;
  membershipId?: MembershipId;
  request?: AuditRequestRef;
}

export interface AcceptInvitationResult {
  invitationId: InvitationId;
  membershipId: MembershipId;
  organizationId: OrganizationId;
}
