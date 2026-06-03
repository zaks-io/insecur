import {
  ENVIRONMENT_ERROR_CODES,
  ENVIRONMENT_LIFECYCLE_STATES,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";

import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import {
  EnvironmentLifecycleStoreError,
  mapEnvironmentLifecycleRow,
} from "./map-environment-lifecycle-row.js";
import { resolvePreviewAutomationOptInPatch } from "./resolve-preview-automation-opt-in-patch.js";
import type {
  EnvironmentLifecycleRow,
  InsertEnvironmentLifecycleInput,
  UpdateEnvironmentLifecyclePatch,
} from "./types.js";

export class TenantEnvironmentLifecycleStore {
  constructor(private readonly sql: TenantScopedSql) {}

  async getByProjectCoordinate(
    organizationId: OrganizationId,
    projectId: ProjectId,
    environmentId: EnvironmentId,
  ): Promise<ReturnType<typeof mapEnvironmentLifecycleRow> | undefined> {
    const rows = await this.sql<EnvironmentLifecycleRow[]>`
      SELECT
        id,
        org_id,
        project_id,
        display_name,
        is_protected,
        posture_tier,
        lifecycle_state,
        preview_non_protected_opt_down_at,
        preview_non_protected_opt_down_actor_user_id,
        preview_automation_opt_in_at,
        preview_automation_opt_in_actor_user_id,
        lifecycle_updated_at,
        created_at
      FROM environments
      WHERE org_id = ${organizationId}
        AND project_id = ${projectId}
        AND id = ${environmentId}
    `;
    const row = rows[0];
    return row === undefined ? undefined : mapEnvironmentLifecycleRow(row);
  }

  async insert(input: InsertEnvironmentLifecycleInput): Promise<void> {
    await this.sql`
      INSERT INTO environments (
        id,
        org_id,
        project_id,
        display_name,
        is_protected,
        posture_tier,
        lifecycle_state,
        preview_non_protected_opt_down_at,
        preview_non_protected_opt_down_actor_user_id
      )
      VALUES (
        ${input.environmentId},
        ${input.organizationId},
        ${input.projectId},
        ${input.displayName},
        ${input.isProtected},
        ${input.postureTier},
        ${ENVIRONMENT_LIFECYCLE_STATES.active},
        ${input.previewNonProtectedOptDownAt ?? null},
        ${input.previewNonProtectedOptDownActorUserId ?? null}
      )
    `;
  }

  async updateLifecycleMetadata(
    organizationId: OrganizationId,
    projectId: ProjectId,
    environmentId: EnvironmentId,
    patch: UpdateEnvironmentLifecyclePatch,
  ): Promise<ReturnType<typeof mapEnvironmentLifecycleRow>> {
    const current = await this.getByProjectCoordinate(organizationId, projectId, environmentId);
    if (current === undefined) {
      throw notFoundError();
    }

    const previewAutomation = resolvePreviewAutomationOptInPatch(current, patch);
    const rows = await this.sql<EnvironmentLifecycleRow[]>`
      UPDATE environments
      SET
        lifecycle_state = ${patch.lifecycleState ?? current.lifecycleState},
        preview_automation_opt_in_at = ${previewAutomation.previewAutomationOptInAt},
        preview_automation_opt_in_actor_user_id = ${previewAutomation.previewAutomationOptInActorUserId},
        lifecycle_updated_at = ${patch.lifecycleUpdatedAt}
      WHERE org_id = ${organizationId}
        AND project_id = ${projectId}
        AND id = ${environmentId}
      RETURNING
        id,
        org_id,
        project_id,
        display_name,
        is_protected,
        posture_tier,
        lifecycle_state,
        preview_non_protected_opt_down_at,
        preview_non_protected_opt_down_actor_user_id,
        preview_automation_opt_in_at,
        preview_automation_opt_in_actor_user_id,
        lifecycle_updated_at,
        created_at
    `;

    const row = rows[0];
    if (row === undefined) {
      throw notFoundError();
    }
    return mapEnvironmentLifecycleRow(row);
  }
}

function notFoundError(): EnvironmentLifecycleStoreError {
  return new EnvironmentLifecycleStoreError(
    ENVIRONMENT_ERROR_CODES.notFound,
    "environment not found",
  );
}
