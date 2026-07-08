import { SECRET_SYNC_ERROR_CODES } from "@insecur/domain";
import { SecretSyncStoreError } from "@insecur/tenant-store";
import { describe, expect, it } from "vitest";

import { mapSecretSyncStoreError } from "../src/map-secret-sync-store-error.js";
import { SecretSyncError } from "../src/secret-sync-error.js";

describe("mapSecretSyncStoreError", () => {
  it("maps resource conflicts to secret sync errors", () => {
    expect(() =>
      mapSecretSyncStoreError(new SecretSyncStoreError("sync.resource_conflict")),
    ).toThrow(
      expect.objectContaining({
        code: SECRET_SYNC_ERROR_CODES.resourceConflict,
      }) as SecretSyncError,
    );
  });

  it("maps not found store errors", () => {
    expect(() => mapSecretSyncStoreError(new SecretSyncStoreError("sync.not_found"))).toThrow(
      expect.objectContaining({ code: SECRET_SYNC_ERROR_CODES.notFound }) as SecretSyncError,
    );
  });

  it("rethrows unknown errors", () => {
    const error = new Error("boom");
    expect(() => mapSecretSyncStoreError(error)).toThrow(error);
  });
});
