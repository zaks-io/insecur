import { runBackupExport, type BackupExportStorage } from "@insecur/backup-restore";
import { RootKeyNotConfiguredError, SecretsStoreRootKeyProvider } from "@insecur/crypto";
import * as Sentry from "@sentry/cloudflare";
import { runWithRuntimeConnection } from "@insecur/tenant-store";

import type { RuntimeEnv } from "../env.js";

function createR2BackupExportStorage(bucket: R2Bucket): BackupExportStorage {
  return {
    async putArtifact(key, body) {
      await bucket.put(key, body);
    },
    async putEvidence(key, body) {
      await bucket.put(key, body);
    },
  };
}

async function resolveBackupRootKeyBytes(env: RuntimeEnv): Promise<Uint8Array> {
  const binding = env.INSTANCE_ROOT_KEY_V1;
  if (!binding) {
    throw new RootKeyNotConfiguredError();
  }
  const provider = new SecretsStoreRootKeyProvider(binding);
  return provider.getRootKeyBytes(1);
}

export async function runScheduledBackupExport(
  env: RuntimeEnv,
  scheduledTime: number,
): Promise<void> {
  const backups = env.BACKUPS;
  if (!backups) {
    throw new Error("BACKUPS R2 binding is not configured");
  }

  const scheduledAt = new Date(scheduledTime);
  const rootKeyBytes = await resolveBackupRootKeyBytes(env);
  const connectionString = env.DB?.connectionString;

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
    const { closing } = await runWithRuntimeConnection(connectionString, async () =>
      runBackupExport(exportInput),
    );
    await closing;
    return;
  }

  await runBackupExport(exportInput);
}
