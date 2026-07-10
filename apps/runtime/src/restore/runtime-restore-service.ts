import { WorkerEntrypoint, type env as cloudflareEnv } from "cloudflare:workers";
import { isRestoreImportError, type RestoreImportSuccess } from "@insecur/backup-restore";
import { cloudflareSentryOptions } from "@insecur/observability";
import type { RuntimeRpcResult } from "@insecur/worker-kit";
import * as Sentry from "@sentry/cloudflare";

import type { RuntimeEnv } from "../env.js";
import { toRuntimeRpcError } from "../rpc/runtime-rpc-error.js";
import { executeRestoreImport, type RestoreImportRpcInput } from "./execute-restore-import.js";

type SentryRuntimeRestoreServiceConstructor = new (
  ctx: ExecutionContext,
  env: typeof cloudflareEnv,
) => WorkerEntrypoint<RuntimeEnv>;

/**
 * Restore-only WorkerEntrypoint (ADR-0084), deliberately separate from `RuntimeService`: Service
 * Bindings select an entrypoint per binding, so API/Web (which bind `entrypoint: RuntimeService`)
 * structurally cannot reach this surface, and the deploy-topology gate fails any checked-in
 * binding that names it. The single method opens, verifies, and imports one sealed scheduled
 * export into the armed fresh target; it exposes no decrypt-and-return API of any kind and every
 * result and error is metadata-only.
 */
class RuntimeRestoreServiceBase extends WorkerEntrypoint<RuntimeEnv> {
  async restoreImport(
    input: RestoreImportRpcInput,
  ): Promise<RuntimeRpcResult<RestoreImportSuccess>> {
    try {
      const value = await executeRestoreImport(this.env, this.ctx, input);
      return { ok: true, value };
    } catch (error) {
      // ADR-0030/0084: a failed run is evidenced through the allowlisted telemetry sink (a
      // discarded target keeps no rows). Code only — never envelope bytes or driver detail.
      Sentry.captureMessage("backup.restore_import_failed", { level: "error" });
      if (isRestoreImportError(error)) {
        return {
          ok: false,
          error: { code: error.code, message: error.message, retryable: false },
        };
      }
      return { ok: false, error: toRuntimeRpcError(error) };
    }
  }
}

export type { RuntimeRestoreServiceBase };

export const RuntimeRestoreService = Sentry.withSentry<
  RuntimeEnv,
  unknown,
  unknown,
  SentryRuntimeRestoreServiceConstructor
>(
  cloudflareSentryOptions,
  RuntimeRestoreServiceBase as unknown as SentryRuntimeRestoreServiceConstructor,
);
