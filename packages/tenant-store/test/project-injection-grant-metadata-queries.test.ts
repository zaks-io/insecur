import {
  environmentId,
  injectionGrantId,
  machineIdentityId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listProjectInjectionGrantRows } from "../src/injection-grants/project-injection-grant-metadata-queries.js";
import { loadLatestPrincipalChainActorsByResourceId } from "../src/secrets/secret-write-audit-attribution-queries.js";
import type { TenantScopedDb } from "../src/tenant-scoped-db.js";

vi.mock("../src/secrets/secret-write-audit-attribution-queries.js", () => ({
  loadLatestPrincipalChainActorsByResourceId: vi.fn(async () => new Map()),
}));

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const GRANT = injectionGrantId.brand("igr_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");

function createGrantDb(rows: readonly Record<string, unknown>[]): TenantScopedDb {
  const orderBy = vi.fn(async () => rows);
  const where = vi.fn(() => ({ orderBy }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  return { select: vi.fn(() => ({ from })) } as unknown as TenantScopedDb;
}

function baseGrantRow(overrides: Record<string, unknown> = {}) {
  return {
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
    isProtected: false,
    ...overrides,
  };
}

describe("listProjectInjectionGrantRows", () => {
  beforeEach(() => {
    vi.mocked(loadLatestPrincipalChainActorsByResourceId).mockReset();
    vi.mocked(loadLatestPrincipalChainActorsByResourceId).mockResolvedValue(new Map());
  });

  it("returns an empty list when the project has no injection grants", async () => {
    const rows = await listProjectInjectionGrantRows(createGrantDb([]), {
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(rows).toEqual([]);
  });

  it("maps active grant rows without credential material", async () => {
    const rows = await listProjectInjectionGrantRows(createGrantDb([baseGrantRow()]), {
      organizationId: ORG,
      projectId: PROJECT,
    });

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

  it("does not expose an active protected grant capability id to project readers", async () => {
    const rows = await listProjectInjectionGrantRows(
      createGrantDb([baseGrantRow({ isProtected: true })]),
      { organizationId: ORG, projectId: PROJECT },
    );

    expect(rows).toEqual([]);
  });

  it("derives consumed, revoked, and expired lifecycle statuses", async () => {
    const rows = await listProjectInjectionGrantRows(
      createGrantDb([
        baseGrantRow({
          grantId: injectionGrantId.brand("igr_00000000000000000000000002"),
          consumedAt: new Date("2026-06-24T00:01:00.000Z"),
        }),
        baseGrantRow({
          grantId: injectionGrantId.brand("igr_00000000000000000000000003"),
          revokedAt: new Date("2026-06-24T00:02:00.000Z"),
          revokedReason: "tenant_suspension",
        }),
        baseGrantRow({
          grantId: injectionGrantId.brand("igr_00000000000000000000000004"),
          expiresAt: new Date("2020-01-01T00:00:00.000Z"),
        }),
      ]),
      {
        organizationId: ORG,
        projectId: PROJECT,
      },
    );

    expect(rows.map((row) => row.status)).toEqual(["consumed", "revoked", "expired"]);
    expect(rows[1]?.revokedReason).toBe("tenant_suspension");
  });

  it("attaches principal-chain actors from audit attribution lookups", async () => {
    const issuedActor = {
      actorType: "user" as const,
      userId: USER,
      machineIdentityId: null,
      details: {
        agentSessionId: "ags_00000000000000000000000011",
        harnessName: "cursor",
      },
    };
    const consumedActor = {
      actorType: "machine" as const,
      userId: null,
      machineIdentityId: MACHINE,
      details: {
        githubRunId: "1234567890",
      },
    };

    vi.mocked(loadLatestPrincipalChainActorsByResourceId).mockImplementation(async (_db, input) => {
      if (input.eventCode === "runtime_injection.grant_issued") {
        return new Map([[GRANT, issuedActor]]);
      }
      return new Map([[GRANT, consumedActor]]);
    });

    const rows = await listProjectInjectionGrantRows(createGrantDb([baseGrantRow()]), {
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(rows[0]).toMatchObject({
      issuedByActor: issuedActor,
      consumedByActor: consumedActor,
    });
    expect(vi.mocked(loadLatestPrincipalChainActorsByResourceId).mock.calls.length).toBe(2);
  });

  it("filters malformed grant rows instead of failing the list read", async () => {
    const rows = await listProjectInjectionGrantRows(
      createGrantDb([
        baseGrantRow({ grantId: "not-a-grant-id" }),
        baseGrantRow({ environmentId: "not-an-environment-id" }),
      ]),
      {
        organizationId: ORG,
        projectId: PROJECT,
      },
    );

    expect(rows).toEqual([]);
  });
});
