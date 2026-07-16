import {
  BACKUP_RESTORE_ERROR_CODES,
  RestoreImportError,
  restoreNotArmedError,
  runRestoreImport,
  type RestoreImportSuccess,
} from "@insecur/backup-restore";
import { DEFAULT_ROOT_KEY_VERSION, SecretsStoreRootKeyProvider } from "@insecur/crypto";
import { runWithRuntimeConnection } from "@insecur/tenant-store";

import { createR2BackupExportStorage } from "../backup/r2-backup-export-storage.js";
import type { RuntimeEnv } from "../env.js";
import { instrumentRuntimeSql } from "../sentry-postgres.js";

/** Operator-named restore parameters (ADR-0084): artifact, expected instance, expected key version. */
export interface RestoreImportRpcInput {
  readonly artifactRef: string;
  readonly expectedInstanceId: string;
  readonly expectedRootKeyVersion: number;
}

/**
 * `RESTORE_DB` is never declared in wrangler.jsonc (the deploy-topology gate fails a checked-in
 * binding), so the generated `CloudflareEnv` never carries it. The operator applies it as a
 * deploy-time config change for the restore window only; its absence is the fail-closed default.
 */
export type RestoreArmableEnv = RuntimeEnv & { readonly RESTORE_DB?: Hyperdrive };

function assertRestoreImportInput(input: RestoreImportRpcInput): void {
  if (
    typeof input.artifactRef !== "string" ||
    input.artifactRef.length === 0 ||
    typeof input.expectedInstanceId !== "string" ||
    input.expectedInstanceId.length === 0 ||
    !Number.isInteger(input.expectedRootKeyVersion)
  ) {
    throw new RestoreImportError(
      BACKUP_RESTORE_ERROR_CODES.headerMismatch,
      "restore import input must name an artifact, instance, and root key version",
    );
  }
}

function requireArmedRestoreTarget(env: RestoreArmableEnv): string {
  const restoreDb = env.RESTORE_DB;
  if (restoreDb?.connectionString === undefined || restoreDb.connectionString.length === 0) {
    throw restoreNotArmedError();
  }
  // ADR-0084: import statements run only against the fresh target. A RESTORE_DB pointing at the
  // live database would fail the fresh-target proof anyway, but refusing the identical connection
  // string here keeps the live path structurally untouched even before any statement runs.
  const liveDb = env.DB as Hyperdrive | undefined;
  if (liveDb?.connectionString === restoreDb.connectionString) {
    throw new RestoreImportError(
      BACKUP_RESTORE_ERROR_CODES.targetIsLive,
      "RESTORE_DB points at the normal database target",
    );
  }
  return restoreDb.connectionString;
}

export async function executeRestoreImport(
  env: RestoreArmableEnv,
  ctx: ExecutionContext,
  input: RestoreImportRpcInput,
): Promise<RestoreImportSuccess> {
  assertRestoreImportInput(input);
  const restoreConnectionString = requireArmedRestoreTarget(env);

  // Advisory fail-fast (ADR-0084): trust still derives from the AEAD open inside runRestoreImport.
  if (input.expectedInstanceId !== env.INSTANCE_ID) {
    throw new RestoreImportError(
      BACKUP_RESTORE_ERROR_CODES.headerMismatch,
      "expected instance does not match this deploy's INSTANCE_ID",
    );
  }

  const rootKeyProvider = new SecretsStoreRootKeyProvider(env.INSTANCE_ROOT_KEY_V1);
  const rootKeyBytes = await rootKeyProvider.getRootKeyBytes(DEFAULT_ROOT_KEY_VERSION);

  const { result, closing } = await runWithRuntimeConnection(
    restoreConnectionString,
    () =>
      runRestoreImport({
        artifactRef: input.artifactRef,
        expectedInstanceId: input.expectedInstanceId,
        expectedRootKeyVersion: input.expectedRootKeyVersion,
        boundRootKeyVersions: [DEFAULT_ROOT_KEY_VERSION],
        rootKeyBytes,
        storage: createR2BackupExportStorage(env.BACKUPS),
      }),
    { instrumentSql: instrumentRuntimeSql },
  );
  ctx.waitUntil(closing);
  return result;
}
