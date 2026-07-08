import { describe, expect, it } from "vitest";

import {
  toSecretSyncBindingRow,
  toSecretSyncRow,
} from "../../src/secret-syncs/secret-sync-row-mappers.js";

describe("secret sync row mappers", () => {
  it("maps secret sync rows from database shape", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const row = toSecretSyncRow({
      id: "sync_00000000000000000000000001",
      org_id: "org_00000000000000000000000001",
      project_id: "prj_00000000000000000000000001",
      environment_id: "env_00000000000000000000000001",
      app_connection_id: "conn_00000000000000000000000001",
      display_name: "prod",
      kind: "github-actions",
      mapping_behavior: "managed",
      auto_sync_enabled: true,
      status: "active",
      github_provider_scope: "repository",
      target_repo_id: "repo_00000000000000000000000001",
      target_github_environment_id: null,
      created_by_user_id: "usr_00000000000000000000000001",
      disabled_at: null,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });

    expect(row.displayName).toBe("prod");
    expect(row.kind).toBe("github-actions");
  });

  it("maps binding rows from database shape", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const row = toSecretSyncBindingRow({
      id: "sbind_00000000000000000000000001",
      org_id: "org_00000000000000000000000001",
      secret_sync_id: "sync_00000000000000000000000001",
      secret_id: "sec_00000000000000000000000001",
      created_at: now,
      updated_at: now,
    });

    expect(row.secretId).toBe("sec_00000000000000000000000001");
  });
});
