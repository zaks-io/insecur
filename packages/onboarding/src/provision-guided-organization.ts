import type {
  DisplayName,
  EnvironmentId,
  MembershipId,
  OrganizationId,
  ProjectId,
  TeamId,
  UserId,
} from "@insecur/domain";
import { NotImplementedError } from "@insecur/domain";

export interface ProvisionGuidedOrganizationInput {
  userId: UserId;
  organizationDisplayName?: DisplayName;
  projectDisplayName?: DisplayName;
  environmentDisplayName?: DisplayName;
}

/** Metadata-only provisioning result (Opaque Resource IDs only). */
export interface ProvisionGuidedOrganizationResult {
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
  ownerMembershipId: MembershipId;
  projectId: ProjectId;
  developmentEnvironmentId: EnvironmentId;
}

/**
 * Creates Personal Organization, Default Team, owner Membership, first Project,
 * and non-protected development Environment for an admitted User.
 */
export function provisionGuidedOrganization(
  input: ProvisionGuidedOrganizationInput,
): Promise<ProvisionGuidedOrganizationResult> {
  void input;
  return Promise.reject(new NotImplementedError("provisionGuidedOrganization"));
}
