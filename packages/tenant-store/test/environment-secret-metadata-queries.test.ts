import { environmentId, organizationId, projectId, secretId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import type { TenantScopedDb } from "../src/tenant-scoped-db.js";
import { listSecretVersionMetadataRows } from "../src/secrets/environment-secret-metadata-queries.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");

function createVersionMetadataDb(
  currentVersionId: string | null,
  versionRows: readonly Record<string, unknown>[],
): TenantScopedDb {
  let selectCall = 0;
  const orderBy = vi.fn(async () => versionRows);
  const where = vi.fn(() => ({ orderBy }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin, where }));
  const limit = vi.fn(async () => [{ currentVersionId }]);
  const secretWhere = vi.fn(() => ({ limit }));
  const secretFrom = vi.fn(() => ({ where: secretWhere }));
  const select = vi.fn(() => {
    selectCall += 1;
    return selectCall === 1 ? { from: secretFrom } : { from };
  });

  return { select } as unknown as TenantScopedDb;
}

describe("listSecretVersionMetadataRows", () => {
  it("marks only live versions as published while retaining publishedAt on retained rows", async () => {
    const publishedAt = new Date("2026-06-24T01:00:00.000Z");
    const db = createVersionMetadataDb("sv_00000000000000000000000002", [
      {
        secretVersionId: "sv_00000000000000000000000002",
        versionNumber: 2,
        lifecycleState: "live",
        createdAt: new Date("2026-06-24T01:00:00.000Z"),
        publishedAt,
      },
      {
        secretVersionId: "sv_00000000000000000000000001",
        versionNumber: 1,
        lifecycleState: "retained",
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
        publishedAt,
      },
      {
        secretVersionId: "sv_00000000000000000000000003",
        versionNumber: 3,
        lifecycleState: "draft",
        createdAt: new Date("2026-06-25T00:00:00.000Z"),
        publishedAt: null,
      },
    ]);

    const rows = await listSecretVersionMetadataRows(db, {
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretId: SECRET,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        secretVersionId: "sv_00000000000000000000000002",
        lifecycleState: "live",
        publishedAt,
        isCurrent: true,
        isPublished: true,
      }),
      expect.objectContaining({
        secretVersionId: "sv_00000000000000000000000001",
        lifecycleState: "retained",
        publishedAt,
        isCurrent: false,
        isPublished: false,
      }),
      expect.objectContaining({
        secretVersionId: "sv_00000000000000000000000003",
        lifecycleState: "draft",
        publishedAt: null,
        isCurrent: false,
        isPublished: false,
      }),
    ]);
  });
});
