import { brandValue, type DisplayName } from "@insecur/domain";
import { ONBOARDING_ERROR_CODES, organizationId, teamId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TEST_INSTANCE_ID,
  TEST_ORG_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const isInstanceOperatorMock = vi.hoisted(() => vi.fn());
const loadInstanceAnchorOrganizationIdMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue("org_00000000000000000000000001"),
);
const persistOperatorOrganizationMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordOperatorOrganizationDeniedMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordOperatorOrganizationCreatedMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

vi.mock("../src/assert-instance-operator.js", () => ({
  isInstanceOperator: isInstanceOperatorMock,
}));

vi.mock("../src/load-instance-anchor-organization-id.js", () => ({
  loadInstanceAnchorOrganizationId: loadInstanceAnchorOrganizationIdMock,
}));

vi.mock("../src/persist-operator-organization.js", () => ({
  persistOperatorOrganization: persistOperatorOrganizationMock,
}));

vi.mock("../src/membership-management-audit.js", () => ({
  recordOperatorOrganizationDenied: recordOperatorOrganizationDeniedMock,
  recordOperatorOrganizationCreated: recordOperatorOrganizationCreatedMock,
}));

import { createOperatorOrganization } from "../src/create-operator-organization.js";
import { MembershipManagementError } from "../src/membership-management-error.js";

const OPERATOR = userId.brand(TEST_USER_ID);
const NON_OPERATOR = userId.brand("usr_00000000000000000000000002");
const ORG = organizationId.brand("org_00000000000000000000000099");
const TEAM = teamId.brand("team_00000000000000000000000099");

function displayName(value: string): DisplayName {
  return brandValue<string, "DisplayName">(value);
}

describe("createOperatorOrganization (unit)", () => {
  beforeEach(() => {
    isInstanceOperatorMock.mockReset();
    loadInstanceAnchorOrganizationIdMock.mockClear();
    persistOperatorOrganizationMock.mockReset();
    persistOperatorOrganizationMock.mockResolvedValue(undefined);
    recordOperatorOrganizationDeniedMock.mockClear();
    recordOperatorOrganizationCreatedMock.mockClear();
  });

  it("creates an operator organization for instance operators", async () => {
    isInstanceOperatorMock.mockResolvedValue(true);

    const result = await createOperatorOrganization({
      instanceId: TEST_INSTANCE_ID,
      operatorUserId: OPERATOR,
      resourceIds: { organizationId: ORG, defaultTeamId: TEAM },
      organizationDisplayName: displayName("Operator org"),
      teamDisplayName: displayName("Operator team"),
    });

    expect(result).toEqual({ organizationId: ORG, defaultTeamId: TEAM });
    expect(persistOperatorOrganizationMock).toHaveBeenCalledWith({
      instanceId: TEST_INSTANCE_ID,
      organizationId: ORG,
      defaultTeamId: TEAM,
      organizationDisplayName: displayName("Operator org"),
      teamDisplayName: displayName("Operator team"),
    });
    expect(recordOperatorOrganizationCreatedMock).toHaveBeenCalledWith({
      operatorUserId: OPERATOR,
      organizationId: ORG,
      defaultTeamId: TEAM,
    });
  });

  it("denies non-operators with audit before persistence", async () => {
    isInstanceOperatorMock.mockResolvedValue(false);

    await expect(
      createOperatorOrganization({
        instanceId: TEST_INSTANCE_ID,
        operatorUserId: NON_OPERATOR,
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.notInstanceOperator,
    });

    expect(loadInstanceAnchorOrganizationIdMock).toHaveBeenCalledWith(TEST_INSTANCE_ID);
    expect(recordOperatorOrganizationDeniedMock).toHaveBeenCalledWith({
      operatorUserId: NON_OPERATOR,
      organizationId: organizationId.brand(TEST_ORG_A_ID),
      reasonCode: ONBOARDING_ERROR_CODES.notInstanceOperator,
    });
    expect(persistOperatorOrganizationMock).not.toHaveBeenCalled();
    await expect(
      createOperatorOrganization({
        instanceId: TEST_INSTANCE_ID,
        operatorUserId: NON_OPERATOR,
      }),
    ).rejects.toBeInstanceOf(MembershipManagementError);
  });

  it("rejects invalid display names before persistence", async () => {
    isInstanceOperatorMock.mockResolvedValue(true);

    await expect(
      createOperatorOrganization({
        instanceId: TEST_INSTANCE_ID,
        operatorUserId: OPERATOR,
        organizationDisplayName: displayName("   "),
      }),
    ).rejects.toMatchObject({
      code: "validation.display_name_empty",
    });
    expect(persistOperatorOrganizationMock).not.toHaveBeenCalled();
  });

  it("maps unique constraint violations to resource conflict", async () => {
    isInstanceOperatorMock.mockResolvedValue(true);
    persistOperatorOrganizationMock.mockRejectedValue({ code: "23505" });

    await expect(
      createOperatorOrganization({
        instanceId: TEST_INSTANCE_ID,
        operatorUserId: OPERATOR,
        resourceIds: { organizationId: ORG, defaultTeamId: TEAM },
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.resourceConflict,
      organizationId: ORG,
    });
    expect(recordOperatorOrganizationCreatedMock).not.toHaveBeenCalled();
  });
});
