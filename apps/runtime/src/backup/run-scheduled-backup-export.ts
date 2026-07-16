import { runBackupExport } from "@insecur/backup-restore";
import { SecretsStoreRootKeyProvider } from "@insecur/crypto";
import * as Sentry from "@sentry/cloudflare";
import { runWithRuntimeConnection } from "@insecur/tenant-store";

import type { RuntimeEnv } from "../env.js";
import { maybeRuntimeConnectionString } from "../env.js";
import { instrumentRuntimeSql } from "../sentry-postgres.js";
import { createR2BackupExportStorage } from "./r2-backup-export-storage.js";

async function resolveBackupRootKeyBytes(env: RuntimeEnv): Promise<Uint8Array> {
  const provider = new SecretsStoreRootKeyProvider(env.INSTANCE_ROOT_KEY_V1);
  return provider.getRootKeyBytes(1);
}

export async function runScheduledBackupExport(
  env: RuntimeEnv,
  scheduledTime: number,
): Promise<void> {
  const backups = env.BACKUPS;

  const scheduledAt = new Date(scheduledTime);
  const rootKeyBytes = await resolveBackupRootKeyBytes(env);
  const connectionString = maybeRuntimeConnectionString(env);

  const exportInput = {
    scheduledAt,
    rootKeyBytes,
    storage: createR2BackupExportStorage(backups),
    onExportFailureAlert: () => {
      Sentry.captureMessage("backup.export_failed", { level: "error" });
    },
    ...(env.INSTANCE_ID ? { instanceId: env.INSTANCE_ID } : {}),
  };

  if (connectionString) {
    const { closing } = await runWithRuntimeConnection(
      connectionString,
      async () => runBackupExport(exportInput),
      { instrumentSql: instrumentRuntimeSql },
    );
    await closing;
    return;
  }

  await runBackupExport(exportInput);
}
