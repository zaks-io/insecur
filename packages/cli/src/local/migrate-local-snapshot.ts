import type { EnvironmentId, ProjectId, SecretId, VariableKey } from "@insecur/domain";
import {
  decryptLocalSecretForMigration,
  LOCAL_MODE_ORGANIZATION_ID,
  type LocalStore,
} from "@insecur/local-store";

/** One Variable Key the migrate reconcile must account for, with per-machine value presence. */
export interface MigrateKeyCandidate {
  readonly variableKey: VariableKey;
  readonly secretId: SecretId;
  readonly hasLocalValue: boolean;
}

export interface LocalMigrateSnapshot {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly projectDisplayName: string | null;
  readonly environmentDisplayName: string | null;
  /** Sorted by Variable Key for deterministic preview, reconcile, and manifest order. */
  readonly keys: readonly MigrateKeyCandidate[];
}

/**
 * Metadata-only snapshot of the local project the reconcile works from: every Secret Shape the
 * store knows plus whether a wrapped Current Version exists on this machine. Never touches
 * plaintext — candidates are decrypted one at a time via {@link decryptLocalMigrateCandidate}.
 */
export async function loadLocalMigrateSnapshot(
  store: LocalStore,
  projectId: ProjectId,
  environmentId: EnvironmentId,
): Promise<LocalMigrateSnapshot | null> {
  const project = await store.projects.getProject(projectId);
  if (project === null) {
    return null;
  }
  const environment = await store.projects.getEnvironment(projectId, environmentId);
  const shapes = await store.projects.listSecretShapes(projectId);
  const metadata = await store.secretVersions.listSecretMetadata(projectId, environmentId);
  const secretIdsWithValue = new Set(
    metadata.filter((row) => row.hasCurrentVersion).map((row) => row.secretId),
  );
  const keys = shapes
    .map((shape) => ({
      variableKey: shape.variableKey,
      secretId: shape.secretId,
      hasLocalValue: secretIdsWithValue.has(shape.secretId),
    }))
    .sort((left, right) => left.variableKey.localeCompare(right.variableKey));
  return {
    projectId,
    environmentId,
    projectDisplayName: project.displayName,
    environmentDisplayName: environment?.displayName ?? null,
    keys,
  };
}

/**
 * Decrypts one local Current Version for the migrate egress. The returned bytes exist only to be
 * placed in the possession-check / blind-write request bodies (ADR-0080) — never in output.
 */
export async function decryptLocalMigrateCandidate(
  store: LocalStore,
  snapshot: Pick<LocalMigrateSnapshot, "projectId" | "environmentId">,
  secretId: SecretId,
): Promise<Uint8Array> {
  const wrapped = await store.secretVersions.getCurrentWrappedVersion(snapshot.projectId, secretId);
  if (wrapped === null) {
    throw new Error("local Current Version disappeared during migrate");
  }
  const plaintext = await decryptLocalSecretForMigration(
    store.keyring,
    {
      organizationId: LOCAL_MODE_ORGANIZATION_ID,
      projectId: snapshot.projectId,
      environmentId: snapshot.environmentId,
      secretId,
    },
    wrapped.wrapped,
  );
  return plaintext.unwrapUtf8();
}
