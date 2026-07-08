import type { AppConnectionRow } from "@insecur/tenant-store";

import { toMetadataSafeAppConnectionStatus } from "./metadata-safe-connection-status.js";
import type { MetadataSafeGitHubConnectionValidation } from "./create-github-app-connection.js";

export interface MetadataSafeGitHubConnectionStatus {
  readonly connection: ReturnType<typeof toMetadataSafeAppConnectionStatus>;
  readonly validation: MetadataSafeGitHubConnectionValidation | null;
}

export function toMetadataSafeGitHubConnectionStatus(
  connection: AppConnectionRow,
  validation?: MetadataSafeGitHubConnectionValidation,
): MetadataSafeGitHubConnectionStatus {
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
            installationStatus: null,
            accessibleRepositoryCount: null,
            repositoriesWithinBoundary: null,
          }),
  };
}
