import { filterMembershipsForCoordinate } from "../src/filter-memberships-for-coordinate.js";
import { membershipId, organizationId, projectId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT_A = projectId.brand("prj_00000000000000000000000001");
const PROJECT_B = projectId.brand("prj_00000000000000000000000002");
const USER = userId.brand("usr_00000000000000000000000001");

describe("filterMembershipsForCoordinate", () => {
  it("includes org-tier memberships for every project coordinate", () => {
    const rows = filterMembershipsForCoordinate(
      [
        {
          membershipId: membershipId.brand("mem_00000000000000000000000001"),
          organizationId: ORG,
          projectId: null,
          userId: USER,
          rolePreset: "owner",
        },
        {
          membershipId: membershipId.brand("mem_00000000000000000000000002"),
          organizationId: ORG,
          projectId: PROJECT_B,
          userId: USER,
          rolePreset: "developer",
        },
      ],
      { organizationId: ORG, projectId: PROJECT_A },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.rolePreset).toBe("owner");
  });

  it("excludes memberships from another organization at the same project coordinate", () => {
    const rows = filterMembershipsForCoordinate(
      [
        {
          membershipId: membershipId.brand("mem_00000000000000000000000001"),
          organizationId: organizationId.brand("org_00000000000000000000000002"),
          projectId: null,
          userId: USER,
          rolePreset: "owner",
        },
      ],
      { organizationId: ORG, projectId: PROJECT_A },
    );

    expect(rows).toEqual([]);
  });
});
