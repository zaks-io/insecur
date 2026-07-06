import {
  environmentId,
  machineIdentityId,
  parseVariableKey,
  secretId,
  secretVersionId,
  userId,
  type SecretId,
} from "@insecur/domain";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { auditEvents, secretVersions, secrets } from "../db/schema/tenant-secrets.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import {
  parseSecretVersionLifecycleState,
  SECRET_VERSION_LIFECYCLE_STATES,
} from "./lifecycle-states.js";
import type {
  ListSecretMatrixByProjectInput,
  SecretMatrixLastSetActorRow,
  SecretMatrixSecretRow,
} from "./secret-matrix-metadata-types.js";

const SECRET_WRITE_EVENT_CODES = [
  "secret.non_protected_write",
  "secret.protected_draft_write",
] as const;

interface ResolvedSecretVersionRow {
  readonly secretVersionId: ReturnType<typeof secretVersionId.brand>;
  readonly versionNumber: number;
  readonly lifecycleState: ReturnType<typeof parseSecretVersionLifecycleState>;
  readonly lastSetAt: Date;
}

interface ProjectSecretJoinRow {
  readonly secretId: string;
  readonly environmentId: string;
  readonly variableKey: string;
  readonly liveVersionId: string | null;
  readonly liveVersionNumberFromRow: number | null;
  readonly liveLifecycleState: string | null;
  readonly livePublishedAt: Date | null;
  readonly liveCreatedAt: Date | null;
}

function toLastSetActor(row: {
  actorType: string;
  actorUserId: string | null;
  actorMachineIdentityId: string | null;
}): SecretMatrixLastSetActorRow {
  if (row.actorType === "machine" && row.actorMachineIdentityId) {
    return {
      actorType: "machine",
      userId: null,
      machineIdentityId: machineIdentityId.brand(row.actorMachineIdentityId),
    };
  }
  if (row.actorType === "user") {
    return {
      actorType: "user",
      userId: row.actorUserId ? userId.brand(row.actorUserId) : null,
      machineIdentityId: null,
    };
  }
  return {
    actorType: "ci_exchange",
    userId: null,
    machineIdentityId: null,
  };
}

function toLiveVersion(row: ProjectSecretJoinRow): ResolvedSecretVersionRow | null {
  if (!row.liveVersionId || row.liveVersionNumberFromRow === null || !row.liveLifecycleState) {
    return null;
  }
  return {
    secretVersionId: secretVersionId.brand(row.liveVersionId),
    versionNumber: row.liveVersionNumberFromRow,
    lifecycleState: parseSecretVersionLifecycleState(row.liveLifecycleState),
    lastSetAt: row.livePublishedAt ?? row.liveCreatedAt ?? new Date(0),
  };
}

function resolveLastSet(
  secretIdValue: string,
  resolvedVersion: ResolvedSecretVersionRow,
  lastSetBySecretId: ReadonlyMap<
    string,
    { lastSetAt: Date; lastSetActor: SecretMatrixLastSetActorRow }
  >,
): Pick<SecretMatrixSecretRow, "lastSetAt" | "lastSetActor"> {
  const lastSet = lastSetBySecretId.get(secretIdValue);
  if (!lastSet) {
    return { lastSetAt: resolvedVersion.lastSetAt, lastSetActor: null };
  }
  return { lastSetAt: lastSet.lastSetAt, lastSetActor: lastSet.lastSetActor };
}

function toSecretMatrixRow(
  row: ProjectSecretJoinRow,
  draftVersions: ReadonlyMap<string, ResolvedSecretVersionRow>,
  lastSetBySecretId: ReadonlyMap<
    string,
    { lastSetAt: Date; lastSetActor: SecretMatrixLastSetActorRow }
  >,
): SecretMatrixSecretRow | null {
  const parsedKey = parseVariableKey(row.variableKey);
  if (!parsedKey.ok) {
    return null;
  }

  const resolvedVersion = toLiveVersion(row) ?? draftVersions.get(row.secretId);
  if (!resolvedVersion) {
    return null;
  }

  return {
    secretId: secretId.brand(row.secretId),
    environmentId: environmentId.brand(row.environmentId),
    variableKey: parsedKey.value,
    versionNumber: resolvedVersion.versionNumber,
    secretVersionId: resolvedVersion.secretVersionId,
    lifecycleState: resolvedVersion.lifecycleState,
    ...resolveLastSet(row.secretId, resolvedVersion, lastSetBySecretId),
  };
}

async function loadProjectSecretJoinRows(
  db: TenantScopedDb,
  input: ListSecretMatrixByProjectInput,
): Promise<readonly ProjectSecretJoinRow[]> {
  return db
    .select({
      secretId: secrets.id,
      environmentId: secrets.environmentId,
      variableKey: secrets.variableKey,
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
    latestDraftBySecretId.set(row.secretId, {
      secretVersionId: secretVersionId.brand(row.secretVersionId),
      versionNumber: row.versionNumber,
      lifecycleState: parseSecretVersionLifecycleState(row.lifecycleState),
      lastSetAt: row.createdAt,
    });
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
    lastSetBySecretId.set(row.resourceId, {
      lastSetAt: row.createdAt,
      lastSetActor: toLastSetActor(row),
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
