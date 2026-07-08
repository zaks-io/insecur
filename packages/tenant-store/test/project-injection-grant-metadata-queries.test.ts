import { environmentId, injectionGrantId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { listProjectInjectionGrantRows } from "../src/injection-grants/project-injection-grant-metadata-queries.js";
import type { TenantScopedDb } from "../src/tenant-scoped-db.js";

vi.mock("../src/secrets/secret-write-audit-attribution-queries.js", () => ({
  loadLatestPrincipalChainActorsByResourceId: vi.fn(async () => new Map()),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");

function createGrantDb(rows: readonly Record<string, unknown>[]): TenantScopedDb {
  const orderBy = vi.fn(async () => rows);
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  return { select: vi.fn(() => ({ from })) } as unknown as TenantScopedDb;
}

describe("listProjectInjectionGrantRows", () => {
  it("returns an empty list when the project has no injection grants", async () => {
    const rows = await listProjectInjectionGrantRows(createGrantDb([]), {
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(rows).toEqual([]);
  });

  it("maps active grant rows without credential material", async () => {
    const rows = await listProjectInjectionGrantRows(
      createGrantDb([
        {
          grantId: GRANT,
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          variableKeys: ["DATABASE_URL"],
          expiresAt: new Date("2099-06-24T00:05:00.000Z"),
          consumedAt: null,
          revokedAt: null,
          revokedReason: null,
          createdAt: new Date("2026-06-24T00:00:00.000Z"),
        },
      ]),
      {
        organizationId: ORG,
        projectId: PROJECT,
      },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        grantId: GRANT,
        environmentId: ENV,
        status: "active",
        variableKeys: ["DATABASE_URL"],
      }),
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/token|credential|secret/i);
  });
});
