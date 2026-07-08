import { describe, expect, it } from "vitest";

import { buildCreateSecretSyncInsert } from "../../src/secret-syncs/build-create-secret-sync-insert.js";

describe("buildCreateSecretSyncInsert", () => {
  it("applies defaults for optional create fields", () => {
    const row = buildCreateSecretSyncInsert({
      organizationId: "org_00000000000000000000000001",
      projectId: "prj_00000000000000000000000001",
      environmentId: "env_00000000000000000000000001",
      appConnectionId: "conn_00000000000000000000000001",
      secretSyncId: "sync_00000000000000000000000001",
      displayName: "prod",
      kind: "github-actions",
      createdByUserId: "usr_00000000000000000000000001",
    });

    expect(row.mappingBehavior).toBe("managed");
    expect(row.autoSyncEnabled).toBe(false);
    expect(row.status).toBe("active");
  });
});
