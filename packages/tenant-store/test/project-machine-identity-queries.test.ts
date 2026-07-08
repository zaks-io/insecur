import { organizationId, projectId } from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

import { listProjectMachineIdentityRows } from "../src/machine-access/project-machine-identity-queries.js";
import type { TenantScopedDb } from "../src/tenant-scoped-db.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");

function createMembershipDb(rows: readonly { machineIdentityId: string }[]): TenantScopedDb {
  const from = vi.fn(() => ({
    where: vi.fn(async () => rows),
  }));
  return { select: vi.fn(() => ({ from })) } as unknown as TenantScopedDb;
}

describe("listProjectMachineIdentityRows", () => {
  it("returns an empty list when the project has no machine identity memberships", async () => {
    const rows = await listProjectMachineIdentityRows(createMembershipDb([]), {
      organizationId: ORG,
      projectId: PROJECT,
    });

    expect(rows).toEqual([]);
  });
});
