import { membershipId, organizationId, projectId, userId } from "@insecur/domain";
import type { MembershipRow } from "./membership-row.js";

/** Raw membership columns returned by tenant-scoped membership reads. */
export interface MembershipQueryRow {
  id: string;
  org_id: string;
  project_id: string | null;
  user_id: string;
  role_preset: string;
}

export function mapMembershipRow(row: MembershipQueryRow): MembershipRow {
  return {
    membershipId: membershipId.brand(row.id),
    organizationId: organizationId.brand(row.org_id),
    projectId: row.project_id === null ? null : projectId.brand(row.project_id),
    userId: userId.brand(row.user_id),
    rolePreset: row.role_preset,
  };
}
