import {
  ENVIRONMENT_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  userId,
  type EnvironmentId,
  type OrganizationId,
} from "@insecur/domain";

import type { TenantScopedSql } from "../tenant-scoped-sql.js";
import { EnvironmentLifecycleStoreError } from "./errors.js";
import { resolveEnvironmentProtection } from "./resolve-environment-protection.js";
import type {
  CreateEnvironmentLifecycleInput,
  EnvironmentLifecycleRow,
  UpdateEnvironmentLifecycleMetadataInput,
} from "./types.js";

interface EnvironmentDbRow {
  id: string;
  org_id: string;
  project_id: string;
  display_name: string;
  lifecycle_stage: string;
  is_protected: boolean;
  preview_non_production_confirmed_at: Date | null;
  preview_non_production_confirmed_by_user_id: string | null;
  created_at: Date;
}

function toEnvironmentLifecycleRow(row: EnvironmentDbRow): EnvironmentLifecycleRow {
  const previewOptDown =
    row.preview_non_production_confirmed_at !== null &&
    row.preview_non_production_confirmed_by_user_id !== null
      ? {
          confirmedAt: row.preview_non_production_confirmed_at,
          confirmedByUserId: row.preview_non_production_confirmed_by_user_id,
        }
      : null;

  return {
    environmentId: environmentId.brand(row.id),
    organizationId: organizationId.brand(row.org_id),
    projectId: projectId.brand(row.project_id),
    displayName: row.display_name as EnvironmentLifecycleRow["displayName"],
    lifecycleStage: row.lifecycle_stage as EnvironmentLifecycleRow["lifecycleStage"],
    isProtected: row.is_protected,
    previewNonProductionOptDown:
      previewOptDown === null
        ? null
        : {
            confirmedAt: previewOptDown.confirmedAt,
            confirmedByUserId: userId.brand(previewOptDown.confirmedByUserId),
          },
    createdAt: row.created_at,
  };
}

async function loadEnvironmentRow(
  sql: TenantScopedSql,
  organizationId: OrganizationId,
  environmentIdValue: EnvironmentId,
): Promise<EnvironmentDbRow | null> {
  const rows = await sql<EnvironmentDbRow[]>`
    SELECT
      id,
      org_id,
      project_id,
      display_name,
      lifecycle_stage,
      is_protected,
      preview_non_production_confirmed_at,
      preview_non_production_confirmed_by_user_id,
      created_at
    FROM environments
    WHERE org_id = ${organizationId}
      AND id = ${environmentIdValue}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Tenant-qualified Environment lifecycle metadata store.
 * Callers must gate mutations with Effective Access before invoking update paths.
 */
export class TenantEnvironmentLifecycleStore {
  constructor(private readonly sql: TenantScopedSql) {}

  async getById(
    organizationId: OrganizationId,
    environmentIdValue: EnvironmentId,
  ): Promise<EnvironmentLifecycleRow | null> {
    const row = await loadEnvironmentRow(this.sql, organizationId, environmentIdValue);
    if (!row) {
      return null;
    }
    return toEnvironmentLifecycleRow(row);
  }

  async create(input: CreateEnvironmentLifecycleInput): Promise<EnvironmentLifecycleRow> {
    const protection = resolveEnvironmentProtection(
      input.lifecycleStage,
      input.previewNonProductionOptDown,
    );

    await this.sql`
      INSERT INTO environments (
        id,
        org_id,
        project_id,
        display_name,
        is_protected,
        lifecycle_stage,
        preview_non_production_confirmed_at,
        preview_non_production_confirmed_by_user_id
      )
      VALUES (
        ${input.environmentId},
        ${input.organizationId},
        ${input.projectId},
        ${input.displayName},
        ${protection.isProtected},
        ${input.lifecycleStage},
        ${protection.previewNonProductionOptDown?.confirmedAt ?? null},
        ${protection.previewNonProductionOptDown?.confirmedByUserId ?? null}
      )
    `;

    const created = await this.getById(input.organizationId, input.environmentId);
    if (!created) {
      throw new Error("environment lifecycle row missing after insert");
    }
    return created;
  }

  async updateDisplayName(
    input: UpdateEnvironmentLifecycleMetadataInput,
  ): Promise<EnvironmentLifecycleRow> {
    const existing = await loadEnvironmentRow(this.sql, input.organizationId, input.environmentId);
    if (!existing) {
      throw new EnvironmentLifecycleStoreError(
        ENVIRONMENT_ERROR_CODES.notFound,
        "environment not found",
      );
    }
    if (existing.project_id !== input.projectId) {
      throw new EnvironmentLifecycleStoreError(
        ENVIRONMENT_ERROR_CODES.notFound,
        "environment does not belong to project",
      );
    }

    await this.sql`
      UPDATE environments
      SET display_name = ${input.displayName}
      WHERE org_id = ${input.organizationId}
        AND id = ${input.environmentId}
        AND project_id = ${input.projectId}
    `;

    const updated = await this.getById(input.organizationId, input.environmentId);
    if (!updated) {
      throw new EnvironmentLifecycleStoreError(
        ENVIRONMENT_ERROR_CODES.notFound,
        "environment not found after update",
      );
    }
    return updated;
  }
}
