import { environmentId, parseVariableKey, secretId, secretVersionId } from "@insecur/domain";

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

export type LiveVersionResolution =
  | { readonly kind: "absent" }
  | { readonly kind: "malformed" }
  | { readonly kind: "resolved"; readonly version: ResolvedSecretVersionRow };

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

function isMalformedLiveJoin(row: ProjectSecretJoinRow): boolean {
  return (
    row.liveVersionId === null ||
    row.liveVersionNumberFromRow === null ||
    row.liveLifecycleState === null ||
    row.liveVersionId !== row.currentVersionId
  );
}

function resolveJoinedLiveVersion(row: ProjectSecretJoinRow): LiveVersionResolution {
  const liveVersionId = row.liveVersionId;
  const liveVersionNumber = row.liveVersionNumberFromRow;
  const liveLifecycleState = row.liveLifecycleState;
  if (liveVersionId === null || liveVersionNumber === null || liveLifecycleState === null) {
    return { kind: "malformed" };
  }

  const resolved = toResolvedVersionRow(
    liveVersionId,
    liveVersionNumber,
    liveLifecycleState,
    row.livePublishedAt ?? row.liveCreatedAt ?? new Date(0),
  );
  return resolved ? { kind: "resolved", version: resolved } : { kind: "malformed" };
}

export function resolveLiveVersion(row: ProjectSecretJoinRow): LiveVersionResolution {
  if (row.currentVersionId === null) {
    return { kind: "absent" };
  }
  if (isMalformedLiveJoin(row)) {
    return { kind: "malformed" };
  }
  return resolveJoinedLiveVersion(row);
}

export function resolveVersionForMatrixRow(
  row: ProjectSecretJoinRow,
  draftVersions: ReadonlyMap<string, ResolvedSecretVersionRow>,
): ResolvedSecretVersionRow | null {
  const liveResolution = resolveLiveVersion(row);
  switch (liveResolution.kind) {
    case "resolved":
      return liveResolution.version;
    case "malformed":
      return null;
    case "absent":
      return draftVersions.get(row.secretId) ?? null;
  }
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
