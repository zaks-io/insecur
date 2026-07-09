import { secretId, secretVersionId } from "@insecur/domain";
import { and, asc, eq } from "drizzle-orm";

import { secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { SECRET_VERSION_LIFECYCLE_STATES } from "./lifecycle-states.js";
import type { DraftVersionMetadataRow, ListDraftVersionsInput } from "./types.js";

export async function listDraftVersions(
  db: TenantScopedDb,
  input: ListDraftVersionsInput,
): Promise<DraftVersionMetadataRow[]> {
  const conditions = [
    eq(secrets.orgId, input.organizationId),
    eq(secrets.environmentId, input.environmentId),
    eq(secretVersions.lifecycleState, SECRET_VERSION_LIFECYCLE_STATES.draft),
  ];
  if (input.secretId !== undefined) {
    conditions.push(eq(secrets.id, input.secretId));
  }

  const rows = await db
    .select({
      secretId: secrets.id,
      secretVersionId: secretVersions.id,
      versionNumber: secretVersions.versionNumber,
      variableKey: secrets.variableKey,
    })
    .from(secretVersions)
    .innerJoin(secrets, eq(secretVersions.secretId, secrets.id))
    .where(and(...conditions))
    .orderBy(asc(secretVersions.createdAt));

  return rows.map((row) => ({
    secretId: secretId.brand(row.secretId),
    secretVersionId: secretVersionId.brand(row.secretVersionId),
    versionNumber: row.versionNumber,
    variableKey: row.variableKey as DraftVersionMetadataRow["variableKey"],
  }));
}
