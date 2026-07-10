import type {
  DisplayName,
  EnvironmentId,
  MembershipId,
  OrganizationId,
  ProjectId,
  TeamId,
  UserId,
} from "@insecur/domain";
import { ENVIRONMENT_LIFECYCLE_STAGES } from "@insecur/domain";

import { TenantEnvironmentLifecycleStore } from "../environments/tenant-environment-lifecycle-store.js";
import type { TenantScopedHandles } from "../tenant-scope.js";

const GUIDED_ORGANIZATION_OWNER_ROLE_PRESET = "owner";

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

/**
 * Creates the tenant resource graph for Guided Organization Provisioning on the caller's
 * tenant-scoped transaction, so the caller can commit dependent writes (such as the success
 * audit) atomically with the resource graph.
 */
export async function persistGuidedOrganizationInTenantScope(
  { db, sql }: Pick<TenantScopedHandles, "db" | "sql">,
  input: PersistGuidedOrganizationInput,
): Promise<void> {
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
      ${GUIDED_ORGANIZATION_OWNER_ROLE_PRESET}
    )
  `;

  const environmentStore = new TenantEnvironmentLifecycleStore(db);
  await environmentStore.create({
    organizationId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.developmentEnvironmentId,
    displayName: input.environmentDisplayName,
    lifecycleStage: ENVIRONMENT_LIFECYCLE_STAGES.development,
  });
}
