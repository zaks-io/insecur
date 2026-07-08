import { describe, expect, it } from "vitest";

import { buildSecretSyncUpdatePatch } from "../../src/secret-syncs/build-secret-sync-update-patch.js";

describe("buildSecretSyncUpdatePatch", () => {
  it("applies only provided update fields", () => {
    const patch = buildSecretSyncUpdatePatch({
      organizationId: "org_00000000000000000000000001",
      secretSyncId: "sync_00000000000000000000000001",
      displayName: "renamed",
      status: "disabled",
    });

    expect(patch.displayName).toBe("renamed");
    expect(patch.status).toBe("disabled");
    expect(patch.mappingBehavior).toBeUndefined();
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });
});
