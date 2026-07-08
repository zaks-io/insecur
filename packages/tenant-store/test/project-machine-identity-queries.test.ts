import { environmentId, machineIdentityId, organizationId, projectId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { listProjectMachineIdentityRows } from "../src/machine-access/project-machine-identity-queries.js";
import type { TenantScopedDb } from "../src/tenant-scoped-db.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");

function createMembershipDb(rows: readonly { machineIdentityId: string }[]): TenantScopedDb {
  const from = vi.fn(() => ({
    where: vi.fn(async () => rows),
  }));
  return { select: vi.fn(() => ({ from })) } as unknown as TenantScopedDb;
}

function createProjectMachineIdentityDb(options: {
  readonly memberships: readonly { machineIdentityId: string }[];
  readonly identities: readonly Record<string, unknown>[];
  readonly oidcRows: readonly Record<string, unknown>[];
  readonly deployKeyRows: readonly Record<string, unknown>[];
}): TenantScopedDb {
  const select = vi.fn((fields: Record<string, unknown>) => {
    if (fields.displayName !== undefined) {
      return {
        from: vi.fn(() => ({
          where: vi.fn(async () => options.identities),
        })),
      };
    }
    if (fields.githubRepository !== undefined) {
      return {
        from: vi.fn(() => ({
          where: vi.fn(async () => options.oidcRows),
        })),
      };
    }
    if (fields.nonExpiring !== undefined) {
      return {
        from: vi.fn(() => ({
          where: vi.fn(async () => options.deployKeyRows),
        })),
      };
    }
    return {
      from: vi.fn(() => ({
        where: vi.fn(async () => options.memberships),
      })),
    };
  });

  return { select } as unknown as TenantScopedDb;
}

describe("listProjectMachineIdentityRows", () => {
  it("returns an empty list when the project has no machine identity memberships", async () => {
    const rows = await listProjectMachineIdentityRows(createMembershipDb([]), {
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(rows).toEqual([]);
  });

  it("maps memberships to sorted machine identities with auth method metadata", async () => {
    const rows = await listProjectMachineIdentityRows(
      createProjectMachineIdentityDb({
        memberships: [{ machineIdentityId: MACHINE }],
        identities: [
          {
            machineIdentityId: MACHINE,
            organizationId: ORG,
            displayName: "Zebra CI",
            status: "active",
            createdAt: new Date("2026-06-24T00:00:00.000Z"),
          },
        ],
        oidcRows: [
          {
            id: "oidc_00000000000000000000000001",
            machineIdentityId: MACHINE,
            environmentId: ENV,
            githubRepository: "zaks-io/insecur",
            githubEnvironment: "production",
            status: "active",
            createdAt: new Date("2026-06-24T00:00:00.000Z"),
          },
        ],
        deployKeyRows: [
          {
            id: "edk_00000000000000000000000001",
            machineIdentityId: MACHINE,
            environmentId: ENV,
            status: "active",
            nonExpiring: true,
            expiresAt: null,
            rotationIntervalSeconds: null,
            rotationReminderIntervalSeconds: null,
            createdAt: new Date("2026-06-24T00:00:00.000Z"),
          },
        ],
      }),
      {
        organizationId: ORG,
        projectId: PROJECT,
      },
    );

    expect(rows).toEqual([
      {
        machineIdentityId: MACHINE,
        organizationId: ORG,
        displayName: "Zebra CI",
        status: "active",
        createdAt: new Date("2026-06-24T00:00:00.000Z"),
        githubActionsOidcMethods: [
          expect.objectContaining({
            authMethodId: "oidc_00000000000000000000000001",
            githubRepository: "zaks-io/insecur",
          }),
        ],
        environmentDeployKeyMethods: [
          expect.objectContaining({
            authMethodId: "edk_00000000000000000000000001",
            nonExpiring: true,
          }),
        ],
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/secret|hash|token|credential/i);
  });

  it("drops machine identity rows with invalid identifiers", async () => {
    const rows = await listProjectMachineIdentityRows(
      createProjectMachineIdentityDb({
        memberships: [{ machineIdentityId: "not-a-machine-id" }],
        identities: [
          {
            machineIdentityId: "not-a-machine-id",
            organizationId: ORG,
            displayName: "Broken",
            status: "active",
            createdAt: new Date("2026-06-24T00:00:00.000Z"),
          },
        ],
        oidcRows: [],
        deployKeyRows: [],
      }),
      {
        organizationId: ORG,
        projectId: PROJECT,
      },
    );

    expect(rows).toEqual([]);
  });
});
