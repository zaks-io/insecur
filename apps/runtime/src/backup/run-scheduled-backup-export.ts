import { runBackupExport } from "@insecur/backup-restore";
import { SecretsStoreRootKeyProvider } from "@insecur/crypto";
import * as Sentry from "@sentry/cloudflare";
import { runWithRuntimeConnection, RuntimeConfigMissingError } from "@insecur/tenant-store";

import type { RuntimeEnv } from "../env.js";
import { maybeRuntimeConnectionString } from "../env.js";
import { instrumentRuntimeSql } from "../sentry-postgres.js";
import { createR2BackupExportStorage } from "./r2-backup-export-storage.js";

// Stay below the ten-minute Preview proof claim lease and the Worker wall-time limit.
const EXPORT_TIMEOUT_MS = 9 * 60_000;

async function resolveBackupRootKeyBytes(env: RuntimeEnv): Promise<Uint8Array> {
  const provider = new SecretsStoreRootKeyProvider(env.INSTANCE_ROOT_KEY_V1);
  return provider.getRootKeyBytes(1);
}

export async function runScheduledBackupExport(
  env: RuntimeEnv,
  scheduledTime: number,
  ctx: Pick<ExecutionContext, "waitUntil">,
): Promise<void> {
  const connectionString = maybeRuntimeConnectionString(env);
  if (!connectionString) {
    throw new RuntimeConfigMissingError();
  }

  // Return errors from the callback so runWithRuntimeConnection exposes the closing promise on
  // both paths. The scheduled event owns cleanup via waitUntil, just like the RPC entrypoint.
  const { result, closing } = await runWithRuntimeConnection(
    connectionString,
    async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          exportBackup(env, scheduledTime),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
              Sentry.captureMessage("backup.export_failed", { level: "error" });
              reject(new Error("backup export timed out"));
            }, EXPORT_TIMEOUT_MS);
          }),
        ]);
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, error };
      } finally {
        clearTimeout(timeout);
      }
    },
    { instrumentSql: instrumentRuntimeSql },
  );
  ctx.waitUntil(closing);
  if (!result.ok) {
    throw result.error;
  }
}

async function exportBackup(env: RuntimeEnv, scheduledTime: number): Promise<void> {
  const rootKeyBytes = await resolveBackupRootKeyBytes(env);
  await runBackupExport({
    scheduledAt: new Date(scheduledTime),
    rootKeyBytes,
    storage: createR2BackupExportStorage(env.BACKUPS),
    onExportFailureAlert: () => {
      Sentry.captureMessage("backup.export_failed", { level: "error" });
    },
    ...(env.INSTANCE_ID ? { instanceId: env.INSTANCE_ID } : {}),
  });
}
