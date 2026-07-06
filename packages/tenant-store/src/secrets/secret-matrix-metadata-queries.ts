import { secretId, type SecretId } from "@insecur/domain";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { auditEvents, secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import { SECRET_VERSION_LIFECYCLE_STATES } from "./lifecycle-states.js";
import {
  shouldSkipMalformedMachineAuditRow,
  toLastSetActor,
} from "./secret-matrix-last-set-actor-mapping.js";
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

const SECRET_WRITE_EVENT_CODES = [
  "secret.non_protected_write",
  "secret.protected_draft_write",
] as const;

async function loadProjectSecretJoinRows(
  db: TenantScopedDb,
  input: ListSecretMatrixByProjectInput,
): Promise<readonly ProjectSecretJoinRow[]> {
  return db
    .select({
      secretId: secrets.id,
      environmentId: secrets.environmentId,
      variableKey: secrets.variableKey,
      currentVersionId: secrets.currentVersionId,
      liveVersionId: secretVersions.id,
      liveVersionNumberFromRow: secretVersions.versionNumber,
      liveLifecycleState: secretVersions.lifecycleState,
      livePublishedAt: secretVersions.publishedAt,
      liveCreatedAt: secretVersions.createdAt,
    })
    .from(secrets)
    .leftJoin(
      secretVersions,
      and(eq(secrets.orgId, secretVersions.orgId), eq(secrets.currentVersionId, secretVersions.id)),
    )
    .where(and(eq(secrets.orgId, input.organizationId), eq(secrets.projectId, input.projectId)))
    .orderBy(asc(secrets.variableKey), asc(secrets.environmentId));
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
  if (secretIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      resourceId: auditEvents.resourceId,
      actorType: auditEvents.actorType,
      actorUserId: auditEvents.actorUserId,
      actorMachineIdentityId: auditEvents.actorMachineIdentityId,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.orgId, input.organizationId),
        eq(auditEvents.projectId, input.projectId),
        eq(auditEvents.resourceType, "secret"),
        eq(auditEvents.outcome, "success"),
        inArray(auditEvents.resourceId, secretIds),
        inArray(auditEvents.eventCode, [...SECRET_WRITE_EVENT_CODES]),
      ),
    )
    .orderBy(desc(auditEvents.createdAt));

  const lastSetBySecretId = new Map<
    string,
    { lastSetAt: Date; lastSetActor: SecretMatrixLastSetActorRow }
  >();
  for (const row of rows) {
    if (!row.resourceId || lastSetBySecretId.has(row.resourceId)) {
      continue;
    }
    if (shouldSkipMalformedMachineAuditRow(row)) {
      continue;
    }
    const lastSetActor = toLastSetActor(row);
    if (!lastSetActor) {
      continue;
    }
    lastSetBySecretId.set(row.resourceId, {
      lastSetAt: row.createdAt,
      lastSetActor,
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
