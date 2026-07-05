import {
  ENVIRONMENT_ERROR_CODES,
  environmentId,
  organizationId,
  projectId,
  userId,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
} from "@insecur/domain";
import { and, asc, eq } from "drizzle-orm";

import { environments } from "../db/schema/tenant-hierarchy.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { EnvironmentLifecycleStoreError } from "./errors.js";
import { resolveEnvironmentProtection } from "./resolve-environment-protection.js";
import { rethrowEnvironmentLifecycleDbError } from "./rethrow-environment-lifecycle-db-error.js";
import type {
  CreateEnvironmentLifecycleInput,
  EnvironmentLifecycleRow,
  UpdateEnvironmentLifecycleMetadataInput,
} from "./types.js";

const environmentLifecycleSelect = {
  id: environments.id,
  orgId: environments.orgId,
  projectId: environments.projectId,
  displayName: environments.displayName,
  lifecycleStage: environments.lifecycleStage,
  isProtected: environments.isProtected,
  previewNonProductionConfirmedAt: environments.previewNonProductionConfirmedAt,
  previewNonProductionConfirmedByUserId: environments.previewNonProductionConfirmedByUserId,
  createdAt: environments.createdAt,
} as const;

function toEnvironmentLifecycleRow(row: {
  id: string;
  orgId: string;
  projectId: string;
  displayName: string;
  lifecycleStage: string;
  isProtected: boolean;
  previewNonProductionConfirmedAt: Date | null;
  previewNonProductionConfirmedByUserId: string | null;
  createdAt: Date;
}): EnvironmentLifecycleRow {
  const previewOptDown =
    row.previewNonProductionConfirmedAt !== null &&
    row.previewNonProductionConfirmedByUserId !== null
      ? {
          confirmedAt: row.previewNonProductionConfirmedAt,
          confirmedByUserId: userId.brand(row.previewNonProductionConfirmedByUserId),
        }
      : null;

  return {
    environmentId: environmentId.brand(row.id),
    organizationId: organizationId.brand(row.orgId),
    projectId: projectId.brand(row.projectId),
    displayName: row.displayName as EnvironmentLifecycleRow["displayName"],
    lifecycleStage: row.lifecycleStage as EnvironmentLifecycleRow["lifecycleStage"],
    isProtected: row.isProtected,
    previewNonProductionOptDown: previewOptDown,
    createdAt: row.createdAt,
  };
}

/**
 * Tenant-qualified Environment lifecycle metadata store.
 * Callers must gate mutations with Effective Access before invoking update paths.
 */
export class TenantEnvironmentLifecycleStore {
  constructor(private readonly db: TenantScopedDb) {}

  async getById(
    organizationIdValue: OrganizationId,
    environmentIdValue: EnvironmentId,
  ): Promise<EnvironmentLifecycleRow | null> {
    const rows = await this.db
      .select(environmentLifecycleSelect)
      .from(environments)
      .where(
        and(eq(environments.orgId, organizationIdValue), eq(environments.id, environmentIdValue)),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }
    return toEnvironmentLifecycleRow(row);
  }

  async listByProject(
    organizationIdValue: OrganizationId,
    projectIdValue: ProjectId,
  ): Promise<readonly EnvironmentLifecycleRow[]> {
    const rows = await this.db
      .select(environmentLifecycleSelect)
      .from(environments)
      .where(
        and(
          eq(environments.orgId, organizationIdValue),
          eq(environments.projectId, projectIdValue),
        ),
      )
      .orderBy(asc(environments.displayName), asc(environments.id));

    return rows.map((row) => toEnvironmentLifecycleRow(row));
  }

  async create(input: CreateEnvironmentLifecycleInput): Promise<EnvironmentLifecycleRow> {
    const protection = resolveEnvironmentProtection(
      input.lifecycleStage,
      input.previewNonProductionOptDown,
    );

    await this.db.insert(environments).values({
      id: input.environmentId,
      orgId: input.organizationId,
      projectId: input.projectId,
      displayName: input.displayName,
      isProtected: protection.isProtected,
      lifecycleStage: input.lifecycleStage,
      previewNonProductionConfirmedAt: protection.previewNonProductionOptDown?.confirmedAt ?? null,
      previewNonProductionConfirmedByUserId:
        protection.previewNonProductionOptDown?.confirmedByUserId ?? null,
    });

    const created = await this.getById(input.organizationId, input.environmentId);
    if (!created) {
      throw new Error("environment lifecycle row missing after insert");
    }
    return created;
  }

  async updateDisplayName(
    input: UpdateEnvironmentLifecycleMetadataInput,
  ): Promise<EnvironmentLifecycleRow> {
    const existing = await this.getById(input.organizationId, input.environmentId);
    if (!existing) {
      throw new EnvironmentLifecycleStoreError(
        ENVIRONMENT_ERROR_CODES.notFound,
        "environment not found",
      );
    }
    if (existing.projectId !== input.projectId) {
      throw new EnvironmentLifecycleStoreError(
        ENVIRONMENT_ERROR_CODES.notFound,
        "environment does not belong to project",
      );
    }

    try {
      await this.db
        .update(environments)
        .set({ displayName: input.displayName })
        .where(
          and(
            eq(environments.orgId, input.organizationId),
            eq(environments.id, input.environmentId),
            eq(environments.projectId, input.projectId),
          ),
        );
    } catch (error) {
      rethrowEnvironmentLifecycleDbError(error);
    }

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
