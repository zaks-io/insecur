import type {
  DisplayName,
  EnvironmentId,
  MembershipId,
  OrganizationId,
  ProjectId,
  TeamId,
  UserId,
} from "@insecur/domain";
import { environmentId, membershipId, organizationId, projectId, teamId } from "@insecur/domain";
import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
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

interface ExistingOwnerOrganizationRow {
  org_id: string;
  membership_id: string;
}

interface ExistingProvisionShapeRow {
  org_id: string;
  team_id: string;
  membership_id: string;
  project_id: string;
  environment_id: string;
  is_protected: boolean;
}

function mapProvisionShapeRow(row: ExistingProvisionShapeRow): GuidedOrganizationResourceIds {
  return {
    organizationId: organizationId.brand(row.org_id),
    defaultTeamId: teamId.brand(row.team_id),
    ownerMembershipId: membershipId.brand(row.membership_id),
    projectId: projectId.brand(row.project_id),
    developmentEnvironmentId: environmentId.brand(row.environment_id),
  };
}

/**
 * Finds an existing organization-tier owner membership for the user on the instance.
 */
export async function findExistingOwnerOrganization(
  instanceId: string,
  userId: UserId,
): Promise<{ organizationId: OrganizationId; ownerMembershipId: MembershipId } | null> {
  return withTenantScope({ kind: "service" }, async (sql) => {
    const rows = await sql<ExistingOwnerOrganizationRow[]>`
      SELECT m.org_id, m.id AS membership_id
      FROM memberships m
      INNER JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ${userId}
        AND m.role_preset = ${BUILT_IN_ROLE_PRESETS.owner}
        AND m.project_id IS NULL
        AND o.instance_id = ${instanceId}
      ORDER BY m.id
      LIMIT 2
    `;

    if (rows.length === 0) {
      return null;
    }
    if (rows.length > 1) {
      throw new Error("multiple owner organizations for user on instance");
    }

    const row = rows[0];
    if (row === undefined) {
      return null;
    }

    return {
      organizationId: organizationId.brand(row.org_id),
      ownerMembershipId: membershipId.brand(row.membership_id),
    };
  });
}

/**
 * Loads the First Value tenant shape when all expected resources already exist.
 */
export async function loadExistingGuidedOrganizationShape(
  ids: GuidedOrganizationResourceIds,
  userId: UserId,
): Promise<GuidedOrganizationResourceIds | null> {
  return withTenantScope(
    { kind: "organization", organizationId: ids.organizationId },
    async (sql) => {
      const rows = await sql<ExistingProvisionShapeRow[]>`
        SELECT
          o.id AS org_id,
          t.id AS team_id,
          m.id AS membership_id,
          p.id AS project_id,
          e.id AS environment_id,
          e.is_protected
        FROM organizations o
        INNER JOIN teams t
          ON t.org_id = o.id
          AND t.id = ${ids.defaultTeamId}
          AND t.is_default = true
        INNER JOIN memberships m
          ON m.org_id = o.id
          AND m.id = ${ids.ownerMembershipId}
          AND m.user_id = ${userId}
          AND m.team_id = t.id
          AND m.role_preset = ${BUILT_IN_ROLE_PRESETS.owner}
          AND m.project_id IS NULL
        INNER JOIN projects p
          ON p.org_id = o.id
          AND p.id = ${ids.projectId}
        INNER JOIN environments e
          ON e.org_id = o.id
          AND e.id = ${ids.developmentEnvironmentId}
          AND e.project_id = p.id
        WHERE o.id = ${ids.organizationId}
        LIMIT 1
      `;

      const row = rows[0];
      if (row === undefined || row.is_protected) {
        return null;
      }

      return mapProvisionShapeRow(row);
    },
  );
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
      await sql`
        INSERT INTO environments (id, org_id, project_id, display_name, is_protected)
        VALUES (
          ${input.developmentEnvironmentId},
          ${input.organizationId},
          ${input.projectId},
          ${input.environmentDisplayName},
          false
        )
      `;
    },
  );
}
