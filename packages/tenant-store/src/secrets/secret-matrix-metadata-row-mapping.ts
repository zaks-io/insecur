import {
  environmentId,
  machineIdentityId,
  parseVariableKey,
  secretId,
  secretVersionId,
  userId,
} from "@insecur/domain";

import { parseSecretVersionLifecycleState } from "./lifecycle-states.js";
import type {
  SecretMatrixLastSetActorRow,
  SecretMatrixSecretRow,
} from "./secret-matrix-metadata-types.js";

export interface ResolvedSecretVersionRow {
  readonly secretVersionId: ReturnType<typeof secretVersionId.brand>;
  readonly versionNumber: number;
  readonly lifecycleState: ReturnType<typeof parseSecretVersionLifecycleState>;
  readonly lastSetAt: Date;
}

export interface ProjectSecretJoinRow {
  readonly secretId: string;
  readonly environmentId: string;
  readonly variableKey: string;
  readonly currentVersionId: string | null;
  readonly liveVersionId: string | null;
  readonly liveVersionNumberFromRow: number | null;
  readonly liveLifecycleState: string | null;
  readonly livePublishedAt: Date | null;
  readonly liveCreatedAt: Date | null;
}

export function toLastSetActor(row: {
  actorType: string;
  actorUserId: string | null;
  actorMachineIdentityId: string | null;
}): SecretMatrixLastSetActorRow | null {
  if (row.actorType === "machine") {
    if (!row.actorMachineIdentityId) {
      return null;
    }
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
  if (row.actorType === "ci_exchange") {
    return {
      actorType: "ci_exchange",
      userId: null,
      machineIdentityId: null,
    };
  }
  return null;
}

function parseStoredSecretVersionId(
  raw: string,
): ResolvedSecretVersionRow["secretVersionId"] | null {
  const parsed = secretVersionId.parse(raw);
  return parsed.ok ? parsed.value : null;
}

export function toResolvedVersionRow(
  secretVersionIdValue: string,
  versionNumber: number,
  lifecycleState: string,
  lastSetAt: Date,
): ResolvedSecretVersionRow | null {
  const parsedVersionId = parseStoredSecretVersionId(secretVersionIdValue);
  if (!parsedVersionId) {
    return null;
  }
  return {
    secretVersionId: parsedVersionId,
    versionNumber,
    lifecycleState: parseSecretVersionLifecycleState(lifecycleState),
    lastSetAt,
  };
}

function hasLiveVersionPointer(row: ProjectSecretJoinRow): boolean {
  return row.currentVersionId !== null;
}

function toLiveVersion(row: ProjectSecretJoinRow): ResolvedSecretVersionRow | null {
  if (!row.liveVersionId || row.liveVersionNumberFromRow === null || !row.liveLifecycleState) {
    return null;
  }
  return toResolvedVersionRow(
    row.liveVersionId,
    row.liveVersionNumberFromRow,
    row.liveLifecycleState,
    row.livePublishedAt ?? row.liveCreatedAt ?? new Date(0),
  );
}

function resolveVersionForMatrixRow(
  row: ProjectSecretJoinRow,
  draftVersions: ReadonlyMap<string, ResolvedSecretVersionRow>,
): ResolvedSecretVersionRow | null {
  if (!hasLiveVersionPointer(row)) {
    return draftVersions.get(row.secretId) ?? null;
  }
  return toLiveVersion(row);
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

export function toSecretMatrixRow(
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

  const resolvedVersion = resolveVersionForMatrixRow(row, draftVersions);
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
