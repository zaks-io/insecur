import type {
  DisplayName,
  EnvironmentId,
  MembershipId,
  OrganizationId,
  ProjectId,
  TeamId,
  UserId,
} from "@insecur/domain";
import type { AuditRequestRef } from "@insecur/audit";

export interface ProvisionGuidedOrganizationResourceIds {
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
  ownerMembershipId: MembershipId;
  projectId: ProjectId;
  developmentEnvironmentId: EnvironmentId;
}

export interface ProvisionGuidedOrganizationInput {
  userId: UserId;
  instanceId: string;
  /** When false, provisioning is denied before any tenant rows are written. */
  isAdmitted: boolean;
  organizationDisplayName?: DisplayName;
  projectDisplayName?: DisplayName;
  teamDisplayName?: DisplayName;
  environmentDisplayName?: DisplayName;
  /** Client-minted opaque IDs for idempotent retries (see docs/cli-and-sync.md). */
  resourceIds?: ProvisionGuidedOrganizationResourceIds;
  request?: AuditRequestRef;
}

/** Metadata-only provisioning result (Opaque Resource IDs only). */
export interface ProvisionGuidedOrganizationResult {
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
  ownerMembershipId: MembershipId;
  projectId: ProjectId;
  developmentEnvironmentId: EnvironmentId;
}
