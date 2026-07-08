import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";
import { SecretSyncStoreError } from "@insecur/tenant-store";

import { SecretSyncError } from "./secret-sync-error.js";

export function mapSecretSyncStoreError(error: unknown): never {
  if (error instanceof SecretSyncStoreError) {
    if (error.code === "sync.resource_conflict") {
      throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.resourceConflict, error.message);
    }
    if (error.code === "sync.not_found") {
      throw new SecretSyncError(SECRET_SYNC_ERROR_CODES.notFound, error.message);
    }
  }
  throw error;
}
