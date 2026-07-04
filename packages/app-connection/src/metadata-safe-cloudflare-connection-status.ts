import type { AppConnectionRow } from "@insecur/tenant-store";

import { toMetadataSafeAppConnectionStatus } from "./metadata-safe-connection-status.js";
import type { MetadataSafeCloudflareConnectionValidation } from "./create-cloudflare-scoped-token-connection.js";

export interface MetadataSafeCloudflareConnectionStatus {
  readonly connection: ReturnType<typeof toMetadataSafeAppConnectionStatus>;
  readonly validation: MetadataSafeCloudflareConnectionValidation | null;
}

export function toMetadataSafeCloudflareConnectionStatus(
  connection: AppConnectionRow,
  validation?: MetadataSafeCloudflareConnectionValidation,
): MetadataSafeCloudflareConnectionStatus {
  return {
    connection: toMetadataSafeAppConnectionStatus(connection),
    validation:
      validation ??
      (connection.lastValidationCheckedAt === null
        ? null
        : {
            checkedAt: connection.lastValidationCheckedAt.toISOString(),
            outcome: connection.lastValidationOutcome ?? "failed",
            reasonCode: connection.lastValidationReasonCode,
            tokenStatus: null,
            workerScriptReachable: null,
            hasBoundaryWarning: null,
          }),
  };
}
