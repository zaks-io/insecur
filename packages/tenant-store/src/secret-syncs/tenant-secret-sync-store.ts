import type { OrganizationId, SecretSyncId } from "@insecur/domain";
import { and, eq } from "drizzle-orm";

import { secretSyncBindings, secretSyncs } from "../db/schema/tenant-secret-syncs.js";
import { isUniqueConstraintViolation } from "../is-unique-constraint-violation.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { buildCreateSecretSyncInsert } from "./build-create-secret-sync-insert.js";
import { buildSecretSyncUpdatePatch } from "./build-secret-sync-update-patch.js";
import { SecretSyncStoreError } from "./errors.js";
import { listSecretSyncBindingsForSyncs } from "./list-secret-sync-bindings-for-syncs.js";
import {
  secretSyncBindingSelect,
  secretSyncSelect,
  toSecretSyncBindingRow,
  toSecretSyncRow,
} from "./secret-sync-row-mappers.js";
import type {
  CreateSecretSyncInput,
  ListSecretSyncsInput,
  ReplaceSecretSyncBindingsInput,
  SecretSyncBindingRow,
  SecretSyncRow,
  UpdateSecretSyncInput,
} from "./types.js";

export class TenantSecretSyncStore {
  constructor(private readonly db: TenantScopedDb) {}

  async createSecretSync(input: CreateSecretSyncInput): Promise<SecretSyncRow> {
    try {
      await this.db.insert(secretSyncs).values(buildCreateSecretSyncInsert(input));
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new SecretSyncStoreError("sync.resource_conflict");
      }
      throw error;
    }

    const created = await this.getSecretSyncById(input.organizationId, input.secretSyncId);
    if (!created) {
      throw new SecretSyncStoreError("sync.not_found");
    }
    return created;
  }

  async getSecretSyncById(
    organizationId: OrganizationId,
    secretSyncIdValue: SecretSyncId,
  ): Promise<SecretSyncRow | null> {
    const rows = await this.db
      .select(secretSyncSelect)
      .from(secretSyncs)
      .where(and(eq(secretSyncs.orgId, organizationId), eq(secretSyncs.id, secretSyncIdValue)))
      .limit(1);

    const row = rows[0];
    return row ? toSecretSyncRow(row) : null;
  }

  async listSecretSyncs(input: ListSecretSyncsInput): Promise<readonly SecretSyncRow[]> {
    const rows = await this.db
      .select(secretSyncSelect)
      .from(secretSyncs)
      .where(
        and(
          eq(secretSyncs.orgId, input.organizationId),
          eq(secretSyncs.projectId, input.projectId),
        ),
      );

    return rows.map(toSecretSyncRow);
  }

  async updateSecretSync(input: UpdateSecretSyncInput): Promise<SecretSyncRow> {
    const rows = await this.db
      .update(secretSyncs)
      .set(buildSecretSyncUpdatePatch(input))
      .where(
        and(eq(secretSyncs.orgId, input.organizationId), eq(secretSyncs.id, input.secretSyncId)),
      )
      .returning(secretSyncSelect);

    const row = rows[0];
    if (!row) {
      throw new SecretSyncStoreError("sync.not_found");
    }
    return toSecretSyncRow(row);
  }

  async listBindings(
    organizationId: OrganizationId,
    secretSyncIdValue: SecretSyncId,
  ): Promise<readonly SecretSyncBindingRow[]> {
    const rows = await this.db
      .select(secretSyncBindingSelect)
      .from(secretSyncBindings)
      .where(
        and(
          eq(secretSyncBindings.orgId, organizationId),
          eq(secretSyncBindings.secretSyncId, secretSyncIdValue),
        ),
      );

    return rows.map(toSecretSyncBindingRow);
  }

  async replaceBindings(
    input: ReplaceSecretSyncBindingsInput,
  ): Promise<readonly SecretSyncBindingRow[]> {
    await this.db
      .delete(secretSyncBindings)
      .where(
        and(
          eq(secretSyncBindings.orgId, input.organizationId),
          eq(secretSyncBindings.secretSyncId, input.secretSyncId),
        ),
      );

    if (input.bindings.length === 0) {
      return [];
    }

    try {
      await this.db.insert(secretSyncBindings).values(
        input.bindings.map((binding) => ({
          id: binding.bindingId,
          orgId: binding.organizationId,
          secretSyncId: binding.secretSyncId,
          secretId: binding.secretId,
        })),
      );
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new SecretSyncStoreError("sync.resource_conflict");
      }
      throw error;
    }

    return this.listBindings(input.organizationId, input.secretSyncId);
  }

  async listBindingsForSyncs(
    organizationId: OrganizationId,
    secretSyncIds: readonly SecretSyncId[],
  ): Promise<readonly SecretSyncBindingRow[]> {
    return listSecretSyncBindingsForSyncs(this.db, organizationId, secretSyncIds);
  }
}
