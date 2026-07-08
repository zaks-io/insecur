import { secretId, type SecretId } from "@insecur/domain";
import { and, desc, eq, inArray } from "drizzle-orm";

import { secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { loadSecretsWithCurrentVersionJoin } from "./secret-current-version-join.js";
import { SECRET_VERSION_LIFECYCLE_STATES } from "./lifecycle-states.js";
import { loadSecretLastSetAttributionBySecretId } from "./secret-write-audit-attribution-queries.js";
import {
  toResolvedVersionRow,
  toSecretMatrixRow,
  type ProjectSecretJoinRow,
  type ResolvedSecretVersionRow,
} from "./secret-matrix-metadata-row-mapping.js";
import type {
  ListSecretMatrixByProjectInput,
  SecretMatrixLastSetActorRow,
  SecretMatrixSecretRow,
} from "./secret-matrix-metadata-types.js";

async function loadProjectSecretJoinRows(
  db: TenantScopedDb,
  input: ListSecretMatrixByProjectInput,
): Promise<readonly ProjectSecretJoinRow[]> {
  const rows = await loadSecretsWithCurrentVersionJoin(
    db,
    and(eq(secrets.orgId, input.organizationId), eq(secrets.projectId, input.projectId)),
  );
  return rows.map((row) => ({
    secretId: row.secretId,
    environmentId: row.environmentId,
    variableKey: row.variableKey,
    currentVersionId: row.currentVersionId,
    liveVersionId: row.versionId,
    liveVersionNumberFromRow: row.versionNumber,
    liveLifecycleState: row.lifecycleState,
    livePublishedAt: row.publishedAt,
    liveCreatedAt: row.versionCreatedAt,
  }));
}

async function loadLatestDraftVersions(
  db: TenantScopedDb,
  input: ListSecretMatrixByProjectInput,
  secretIds: readonly SecretId[],
): Promise<Map<string, ResolvedSecretVersionRow>> {
  if (secretIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      secretId: secretVersions.secretId,
      secretVersionId: secretVersions.id,
      versionNumber: secretVersions.versionNumber,
      lifecycleState: secretVersions.lifecycleState,
      createdAt: secretVersions.createdAt,
    })
    .from(secretVersions)
    .innerJoin(secrets, eq(secretVersions.secretId, secrets.id))
    .where(
      and(
        eq(secrets.orgId, input.organizationId),
        eq(secrets.projectId, input.projectId),
        inArray(secrets.id, secretIds),
        eq(secretVersions.lifecycleState, SECRET_VERSION_LIFECYCLE_STATES.draft),
      ),
    )
    .orderBy(desc(secretVersions.versionNumber));

  const latestDraftBySecretId = new Map<string, ResolvedSecretVersionRow>();
  for (const row of rows) {
    if (latestDraftBySecretId.has(row.secretId)) {
      continue;
    }
    const resolved = toResolvedVersionRow(
      row.secretVersionId,
      row.versionNumber,
      row.lifecycleState,
      row.createdAt,
    );
    if (!resolved) {
      continue;
    }
    latestDraftBySecretId.set(row.secretId, resolved);
  }

  return latestDraftBySecretId;
}

async function loadLastSetMetadata(
  db: TenantScopedDb,
  input: ListSecretMatrixByProjectInput,
  secretIds: readonly SecretId[],
): Promise<Map<string, { lastSetAt: Date; lastSetActor: SecretMatrixLastSetActorRow }>> {
  const attributionBySecretId = await loadSecretLastSetAttributionBySecretId(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    secretIds,
  });
  const lastSetBySecretId = new Map<
    string,
    { lastSetAt: Date; lastSetActor: SecretMatrixLastSetActorRow }
  >();
  for (const [secretResourceId, attribution] of attributionBySecretId) {
    lastSetBySecretId.set(secretResourceId, {
      lastSetAt: attribution.setAt,
      lastSetActor: attribution.setActor,
    });
  }
  return lastSetBySecretId;
}

export async function listSecretMatrixRowsByProject(
  db: TenantScopedDb,
  input: ListSecretMatrixByProjectInput,
): Promise<readonly SecretMatrixSecretRow[]> {
  const secretRows = await loadProjectSecretJoinRows(db, input);
  if (secretRows.length === 0) {
    return [];
  }

  const secretIds = secretRows.map((row) => secretId.brand(row.secretId));
  const [draftVersions, lastSetBySecretId] = await Promise.all([
    loadLatestDraftVersions(db, input, secretIds),
    loadLastSetMetadata(db, input, secretIds),
  ]);

  return secretRows.flatMap((row) => {
    const matrixRow = toSecretMatrixRow(row, draftVersions, lastSetBySecretId);
    return matrixRow ? [matrixRow] : [];
  });
}
