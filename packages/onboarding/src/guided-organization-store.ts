import type {
  DisplayName,
  EnvironmentId,
  MembershipId,
  OrganizationId,
  ProjectId,
  TeamId,
  UserId,
} from "@insecur/domain";
import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import { ENVIRONMENT_POSTURE_TIERS } from "@insecur/domain";
import { createEnvironmentLifecycle } from "@insecur/environment-lifecycle";
import { withTenantScope } from "@insecur/tenant-store";

export interface GuidedOrganizationResourceIds {
  organizationId: OrganizationId;
  defaultTeamId: TeamId;
  ownerMembershipId: MembershipId;
  projectId: ProjectId;
  developmentEnvironmentId: EnvironmentId;
}

export interface PersistGuidedOrganizationInput extends GuidedOrganizationResourceIds {
  instanceId: string;
  userId: UserId;
  organizationDisplayName: DisplayName;
  projectDisplayName: DisplayName;
  teamDisplayName: DisplayName;
  environmentDisplayName: DisplayName;
}

export async function persistGuidedOrganization(
  input: PersistGuidedOrganizationInput,
): Promise<void> {
  await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    async (sql) => {
      await sql`
        INSERT INTO organizations (id, instance_id, display_name)
        VALUES (${input.organizationId}, ${input.instanceId}, ${input.organizationDisplayName})
      `;
      await sql`
        INSERT INTO projects (id, org_id, display_name)
        VALUES (${input.projectId}, ${input.organizationId}, ${input.projectDisplayName})
      `;
      await sql`
        INSERT INTO teams (id, org_id, display_name, is_default)
        VALUES (
          ${input.defaultTeamId},
          ${input.organizationId},
          ${input.teamDisplayName},
          true
        )
      `;
      await sql`
        INSERT INTO memberships (id, org_id, team_id, user_id, role_preset)
        VALUES (
          ${input.ownerMembershipId},
          ${input.organizationId},
          ${input.defaultTeamId},
          ${input.userId},
          ${BUILT_IN_ROLE_PRESETS.owner}
        )
      `;
    },
  );

  await createEnvironmentLifecycle({
    environmentId: input.developmentEnvironmentId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    displayName: input.environmentDisplayName,
    postureTier: ENVIRONMENT_POSTURE_TIERS.development,
  });
}
