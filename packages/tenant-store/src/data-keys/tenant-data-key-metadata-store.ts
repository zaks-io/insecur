import type { OrganizationId, ProjectId } from "@insecur/domain";
import type {
  OrganizationDataKeyMetadata,
  ProjectDataKeyMetadata,
  TenantDataKeyRewrapStore,
} from "@insecur/crypto";
import { and, desc, eq } from "drizzle-orm";

import {
  listOrganizationDataKeys as listOrganizationDataKeysForRewrap,
  listProjectDataKeys as listProjectDataKeysForRewrap,
  updateOrganizationDataKeyWrap as persistOrganizationDataKeyWrap,
  updateProjectDataKeyWrap as persistProjectDataKeyWrap,
} from "./data-key-rewrap-store.js";
import {
  organizationDataKeySelect,
  projectDataKeySelect,
  toOrganizationMetadata,
  toProjectMetadata,
} from "./data-key-store-mappers.js";
import { organizationDataKeys, projectDataKeys } from "../db/schema/tenant-hierarchy.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import type { SeedOrganizationDataKeyInput, SeedProjectDataKeyInput } from "./types.js";

/** Tenant-scoped reads and writes for organization and project data key metadata. */
export class TenantDataKeyMetadataStore implements TenantDataKeyRewrapStore {
  constructor(private readonly db: TenantScopedDb) {}

  async getOrganizationDataKeyForReadiness(organizationId: OrganizationId) {
    const active = await this.getActiveOrganizationDataKey(organizationId);
    if (active) {
      return active;
    }
    return this.getLatestOrganizationDataKey(organizationId);
  }

  async getProjectDataKeyForReadiness(organizationId: OrganizationId, projectId: ProjectId) {
    const active = await this.getActiveProjectDataKey(organizationId, projectId);
    if (active) {
      return active;
    }
    return this.getLatestProjectDataKey(organizationId, projectId);
  }

  async getActiveOrganizationDataKey(organizationId: OrganizationId) {
    const rows = await this.db
      .select(organizationDataKeySelect)
      .from(organizationDataKeys)
      .where(
        and(
          eq(organizationDataKeys.orgId, organizationId),
          eq(organizationDataKeys.status, "active"),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toOrganizationMetadata(row) : null;
  }

  async getOrganizationDataKeyVersion(organizationId: OrganizationId, keyVersion: number) {
    const rows = await this.db
      .select(organizationDataKeySelect)
      .from(organizationDataKeys)
      .where(
        and(
          eq(organizationDataKeys.orgId, organizationId),
          eq(organizationDataKeys.keyVersion, keyVersion),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toOrganizationMetadata(row) : null;
  }

  async getActiveProjectDataKey(organizationId: OrganizationId, projectId: ProjectId) {
    const rows = await this.db
      .select(projectDataKeySelect)
      .from(projectDataKeys)
      .where(
        and(
          eq(projectDataKeys.orgId, organizationId),
          eq(projectDataKeys.projectId, projectId),
          eq(projectDataKeys.status, "active"),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toProjectMetadata(row) : null;
  }

  async getProjectDataKeyVersion(
    organizationId: OrganizationId,
    projectId: ProjectId,
    keyVersion: number,
  ) {
    const rows = await this.db
      .select(projectDataKeySelect)
      .from(projectDataKeys)
      .where(
        and(
          eq(projectDataKeys.orgId, organizationId),
          eq(projectDataKeys.projectId, projectId),
          eq(projectDataKeys.keyVersion, keyVersion),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? toProjectMetadata(row) : null;
  }

  private async getLatestOrganizationDataKey(organizationId: OrganizationId) {
    const rows = await this.db
      .select(organizationDataKeySelect)
      .from(organizationDataKeys)
      .where(eq(organizationDataKeys.orgId, organizationId))
      .orderBy(desc(organizationDataKeys.keyVersion))
      .limit(1);
    const row = rows[0];
    return row ? toOrganizationMetadata(row) : null;
  }

  private async getLatestProjectDataKey(organizationId: OrganizationId, projectId: ProjectId) {
    const rows = await this.db
      .select(projectDataKeySelect)
      .from(projectDataKeys)
      .where(
        and(eq(projectDataKeys.orgId, organizationId), eq(projectDataKeys.projectId, projectId)),
      )
      .orderBy(desc(projectDataKeys.keyVersion))
      .limit(1);
    const row = rows[0];
    return row ? toProjectMetadata(row) : null;
  }

  async insertOrganizationDataKey(input: SeedOrganizationDataKeyInput): Promise<void> {
    await this.db
      .insert(organizationDataKeys)
      .values({
        id: input.id,
        orgId: input.organizationId,
        keyVersion: input.keyVersion,
        status: input.status ?? "active",
        rootKeyVersion: input.rootKeyVersion ?? 1,
        wrappedStorageRef: input.wrappedStorageRef ?? null,
        custodyEvidenceRef: input.custodyEvidenceRef ?? null,
      })
      .onConflictDoNothing({
        target: [organizationDataKeys.orgId, organizationDataKeys.keyVersion],
      });
  }

  async insertProjectDataKey(input: SeedProjectDataKeyInput): Promise<void> {
    await this.db
      .insert(projectDataKeys)
      .values({
        id: input.id,
        orgId: input.organizationId,
        projectId: input.projectId,
        keyVersion: input.keyVersion,
        status: input.status ?? "active",
        organizationDataKeyVersion: input.organizationDataKeyVersion,
        wrappedStorageRef: input.wrappedStorageRef ?? null,
      })
      .onConflictDoNothing({
        target: [projectDataKeys.projectId, projectDataKeys.keyVersion],
      });
  }

  listOrganizationDataKeys(organizationId: OrganizationId) {
    return listOrganizationDataKeysForRewrap(this.db, organizationId);
  }

  listProjectDataKeys(organizationId: OrganizationId) {
    return listProjectDataKeysForRewrap(this.db, organizationId);
  }

  updateOrganizationDataKeyWrap(
    organizationId: OrganizationId,
    keyVersion: number,
    input: {
      readonly wrappedStorageRef: string;
      readonly rootKeyVersion: number;
      readonly status: OrganizationDataKeyMetadata["status"];
    },
  ): Promise<void> {
    return persistOrganizationDataKeyWrap(this.db, organizationId, keyVersion, input);
  }

  updateProjectDataKeyWrap(
    organizationId: OrganizationId,
    projectId: ProjectId,
    keyVersion: number,
    input: {
      readonly wrappedStorageRef: string;
      readonly status: ProjectDataKeyMetadata["status"];
    },
  ): Promise<void> {
    return persistProjectDataKeyWrap(this.db, {
      organizationId,
      projectId,
      keyVersion,
      wrappedStorageRef: input.wrappedStorageRef,
      status: input.status,
    });
  }
}
