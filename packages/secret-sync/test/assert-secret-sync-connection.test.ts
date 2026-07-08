import { SECRET_SYNC_KINDS } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { assertSecretSyncConnection } from "../src/assert-secret-sync-connection.js";
import { SecretSyncError } from "../src/secret-sync-error.js";

const baseConnection = {
  id: "conn_00000000000000000000000001",
  organizationId: "org_00000000000000000000000001",
  projectId: "prj_00000000000000000000000001",
  provider: "github",
  connectionMethod: "github-app",
  displayName: "github",
  status: "connected",
  createdByUserId: "usr_00000000000000000000000001",
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

describe("assertSecretSyncConnection", () => {
  it("accepts eligible github connections for github-actions syncs", () => {
    expect(() =>
      assertSecretSyncConnection({
        kind: SECRET_SYNC_KINDS.githubActions,
        connection: {
          ...baseConnection,
          providerAppRegistrationId: "preg_00000000000000000000000001",
          setupUserId: "usr_00000000000000000000000001",
          disconnectedAt: null,
          lastValidatedAt: new Date(),
        },
      }),
    ).not.toThrow();
  });

  it("rejects disconnected connections", () => {
    expect(() =>
      assertSecretSyncConnection({
        kind: SECRET_SYNC_KINDS.githubActions,
        connection: {
          ...baseConnection,
          status: "disconnected",
          providerAppRegistrationId: "preg_00000000000000000000000001",
          setupUserId: "usr_00000000000000000000000001",
          disconnectedAt: new Date(),
          lastValidatedAt: null,
        },
      }),
    ).toThrow(SecretSyncError);
  });
});
