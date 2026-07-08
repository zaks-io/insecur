import { describe, expect, it } from "vitest";

import {
  SECRET_SYNC_BINDING_DESTINATION_FIELD,
  SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE,
  SECRET_SYNC_TARGET_METADATA_TYPE,
  SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD,
  secretSyncBindingRecordResourceId,
  secretSyncTargetRecordResourceId,
} from "../src/secret-sync-metadata.js";
import { BINDING, SYNC } from "./helpers/secret-sync-test-fixtures.js";

describe("secret sync metadata helpers", () => {
  it("brands binding and target record resource ids", () => {
    expect(secretSyncBindingRecordResourceId(BINDING)).toMatch(/^sbind_/);
    expect(secretSyncTargetRecordResourceId(SYNC)).toMatch(/^sync_/);
  });

  it("exposes stable sensitive metadata type constants", () => {
    expect(SECRET_SYNC_BINDING_DESTINATION_METADATA_TYPE).toBe("secret_sync.binding");
    expect(SECRET_SYNC_BINDING_DESTINATION_FIELD).toBe("provider_destination");
    expect(SECRET_SYNC_TARGET_METADATA_TYPE).toBe("secret_sync.target");
    expect(SECRET_SYNC_TARGET_WORKER_SCRIPT_FIELD).toBe("worker_script");
  });
});
