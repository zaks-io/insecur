import type { MembershipId, OrganizationId, ProjectId, UserId } from "@insecur/domain";

/** Tenant-owned membership row used to expand Effective Access. */
export interface MembershipRow {
  membershipId: MembershipId;
  organizationId: OrganizationId;
  /** Null means organization-tier membership. */
  projectId: ProjectId | null;
  userId: UserId;
  rolePreset: string;
}
