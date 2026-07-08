import type { OrganizationId, SecretSyncId } from "@insecur/domain";
import { and, eq, inArray } from "drizzle-orm";

import { secretSyncBindings } from "../db/schema/tenant-secret-syncs.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { secretSyncBindingSelect, toSecretSyncBindingRow } from "./secret-sync-row-mappers.js";
import type { SecretSyncBindingRow } from "./types.js";

export async function listSecretSyncBindingsForSyncs(
  db: TenantScopedDb,
  organizationId: OrganizationId,
  secretSyncIds: readonly SecretSyncId[],
): Promise<readonly SecretSyncBindingRow[]> {
  if (secretSyncIds.length === 0) {
    return [];
  }

  const rows = await db
    .select(secretSyncBindingSelect)
    .from(secretSyncBindings)
    .where(
      and(
        eq(secretSyncBindings.orgId, organizationId),
        inArray(secretSyncBindings.secretSyncId, [...secretSyncIds]),
      ),
    );

  return rows.map(toSecretSyncBindingRow);
}
