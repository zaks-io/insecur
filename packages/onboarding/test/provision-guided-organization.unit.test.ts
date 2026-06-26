import {
  AUTH_ERROR_CODES,
  environmentId,
  membershipId,
  ONBOARDING_ERROR_CODES,
  organizationId,
  projectId,
  teamId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_INSTANCE_ID } from "../../tenant-store/test/rls/test-ids.js";

const persistGuidedOrganizationMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordProvisionSuccessMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../src/guided-organization-store.js", () => ({
  persistGuidedOrganization: persistGuidedOrganizationMock,
}));

vi.mock("../src/provision-guided-organization-audit.js", () => ({
  recordProvisionSuccess: recordProvisionSuccessMock,
}));

import { provisionGuidedOrganization } from "../src/provision-guided-organization.js";
import { GuidedOrganizationProvisionError } from "../src/provision-guided-organization-error.js";

const USER = userId.brand("usr_00000000000000000000000088");
const ORG = organizationId.brand("org_00000000000000000000000088");

describe("provisionGuidedOrganization (unit)", () => {
  beforeEach(() => {
    persistGuidedOrganizationMock.mockReset();
    persistGuidedOrganizationMock.mockResolvedValue(undefined);
    recordProvisionSuccessMock.mockClear();
  });

  it("denies provisioning before persistence when the user is not admitted", async () => {
    await expect(
      provisionGuidedOrganization({
        userId: USER,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: false,
      }),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.required,
    });

    expect(persistGuidedOrganizationMock).not.toHaveBeenCalled();
    expect(recordProvisionSuccessMock).not.toHaveBeenCalled();
    await expect(
      provisionGuidedOrganization({
        userId: USER,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: false,
      }),
    ).rejects.toBeInstanceOf(GuidedOrganizationProvisionError);
  });

  it("persists and records audit for admitted users", async () => {
    const result = await provisionGuidedOrganization({
      userId: USER,
      instanceId: TEST_INSTANCE_ID,
      isAdmitted: true,
    });

    expect(result.organizationId).toMatch(/^org_/);
    expect(persistGuidedOrganizationMock).toHaveBeenCalledOnce();
    expect(recordProvisionSuccessMock).toHaveBeenCalledOnce();
    expect(recordProvisionSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, isAdmitted: true }),
      expect.objectContaining({ organizationId: result.organizationId }),
    );
  });

  it("maps unique constraint violations to resource conflict", async () => {
    persistGuidedOrganizationMock.mockRejectedValue({ code: "23505" });

    await expect(
      provisionGuidedOrganization({
        userId: USER,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: true,
        resourceIds: {
          organizationId: ORG,
          defaultTeamId: teamId.brand("team_00000000000000000000000088"),
          ownerMembershipId: membershipId.brand("mem_00000000000000000000000088"),
          projectId: projectId.brand("prj_00000000000000000000000088"),
          developmentEnvironmentId: environmentId.brand("env_00000000000000000000000088"),
        },
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.resourceConflict,
      organizationId: ORG,
    });

    expect(recordProvisionSuccessMock).not.toHaveBeenCalled();
  });

  it("rethrows non-unique persistence failures", async () => {
    const persistenceError = new Error("database unavailable");
    persistGuidedOrganizationMock.mockRejectedValue(persistenceError);

    await expect(
      provisionGuidedOrganization({
        userId: USER,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: true,
      }),
    ).rejects.toBe(persistenceError);
  });
});
