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

const persistGuidedOrganizationInTenantScopeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
const recordProvisionSuccessInTenantScopeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
const scopedHandles = vi.hoisted(() => ({ db: { tag: "scoped-db" }, sql: { tag: "scoped-sql" } }));
const withTenantScopeMock = vi.hoisted(() =>
  vi.fn().mockImplementation(async (_scope, callback) => callback(scopedHandles)),
);

vi.mock("../src/guided-organization-store.js", () => ({
  persistGuidedOrganizationInTenantScope: persistGuidedOrganizationInTenantScopeMock,
}));

vi.mock("../src/provision-guided-organization-audit.js", () => ({
  recordProvisionSuccessInTenantScope: recordProvisionSuccessInTenantScopeMock,
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: withTenantScopeMock,
  };
});

import { provisionGuidedOrganization } from "../src/provision-guided-organization.js";
import { GuidedOrganizationProvisionError } from "../src/provision-guided-organization-error.js";

const USER = userId.brand("usr_00000000000000000000000088");
const ORG = organizationId.brand("org_00000000000000000000000088");

describe("provisionGuidedOrganization (unit)", () => {
  beforeEach(() => {
    persistGuidedOrganizationInTenantScopeMock.mockReset();
    persistGuidedOrganizationInTenantScopeMock.mockResolvedValue(undefined);
    recordProvisionSuccessInTenantScopeMock.mockReset();
    recordProvisionSuccessInTenantScopeMock.mockResolvedValue(undefined);
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

    expect(persistGuidedOrganizationInTenantScopeMock).not.toHaveBeenCalled();
    expect(recordProvisionSuccessInTenantScopeMock).not.toHaveBeenCalled();
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
    expect(persistGuidedOrganizationInTenantScopeMock).toHaveBeenCalledOnce();
    expect(persistGuidedOrganizationInTenantScopeMock).toHaveBeenCalledWith(
      scopedHandles,
      expect.objectContaining({ userId: USER, organizationId: result.organizationId }),
    );
    expect(recordProvisionSuccessInTenantScopeMock).toHaveBeenCalledOnce();
    expect(recordProvisionSuccessInTenantScopeMock).toHaveBeenCalledWith(
      scopedHandles.sql,
      expect.objectContaining({ userId: USER, isAdmitted: true }),
      expect.objectContaining({ organizationId: result.organizationId }),
    );
  });

  it("fails provisioning when the success audit cannot be recorded in the same scope", async () => {
    const auditFailure = new Error("audit write failed");
    recordProvisionSuccessInTenantScopeMock.mockRejectedValue(auditFailure);

    await expect(
      provisionGuidedOrganization({
        userId: USER,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: true,
      }),
    ).rejects.toBe(auditFailure);
  });

  it("maps unique constraint violations to resource conflict", async () => {
    persistGuidedOrganizationInTenantScopeMock.mockRejectedValue({ code: "23505" });

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

    expect(recordProvisionSuccessInTenantScopeMock).not.toHaveBeenCalled();
  });

  it("rethrows non-unique persistence failures", async () => {
    const persistenceError = new Error("database unavailable");
    persistGuidedOrganizationInTenantScopeMock.mockRejectedValue(persistenceError);

    await expect(
      provisionGuidedOrganization({
        userId: USER,
        instanceId: TEST_INSTANCE_ID,
        isAdmitted: true,
      }),
    ).rejects.toBe(persistenceError);
  });
});
