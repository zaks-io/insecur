import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  invitationId,
  ONBOARDING_ERROR_CODES,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const withTenantScopeMock = vi.hoisted(() => vi.fn());
const recordInvitationCreateDeniedMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope: withTenantScopeMock,
}));

vi.mock("../src/membership-management-audit.js", () => ({
  recordInvitationCreateDenied: recordInvitationCreateDeniedMock,
}));

import {
  assertInvitationProjectCoordinate,
  assertInvitationRolePreset,
} from "../src/assert-invitation-create-input.js";
import { MembershipManagementError } from "../src/membership-management-error.js";
import {
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_PROJECT_B_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const ORG = organizationId.brand(TEST_ORG_A_ID);
const PROJECT_A = projectId.brand(TEST_PROJECT_A_ID);
const PROJECT_B = projectId.brand(TEST_PROJECT_B_ID);
const OWNER = userId.brand(TEST_USER_ID);
const INVITEE = userId.brand("usr_00000000000000000000000002");
const INV = invitationId.brand("inv_00000000000000000000000001");

function createInvitationInput(
  overrides: {
    rolePreset?: string;
    projectId?: ReturnType<typeof projectId.brand>;
  } = {},
) {
  return {
    actor: { type: "user" as const, userId: OWNER },
    organizationId: ORG,
    inviteeUserId: INVITEE,
    rolePreset: overrides.rolePreset ?? BUILT_IN_ROLE_PRESETS.developer,
    ...(overrides.projectId !== undefined ? { projectId: overrides.projectId } : {}),
    invitationId: INV,
  };
}

describe("assertInvitationRolePreset", () => {
  beforeEach(() => {
    recordInvitationCreateDeniedMock.mockClear();
  });

  it("accepts built-in role presets", async () => {
    await expect(assertInvitationRolePreset(createInvitationInput())).resolves.toBeUndefined();
    expect(recordInvitationCreateDeniedMock).not.toHaveBeenCalled();
  });

  it("denies invalid role presets with audit and MembershipManagementError", async () => {
    await expect(
      assertInvitationRolePreset(createInvitationInput({ rolePreset: "not-a-built-in-role" })),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.invitationInvalid,
    });

    expect(recordInvitationCreateDeniedMock).toHaveBeenCalledWith({
      actorUserId: OWNER,
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.invitationInvalid,
    });
    await expect(
      assertInvitationRolePreset(createInvitationInput({ rolePreset: "not-a-built-in-role" })),
    ).rejects.toBeInstanceOf(MembershipManagementError);
  });
});

describe("assertInvitationProjectCoordinate", () => {
  beforeEach(() => {
    withTenantScopeMock.mockReset();
    recordInvitationCreateDeniedMock.mockClear();
  });

  it("skips project lookup for organization-scoped invitations", async () => {
    await expect(
      assertInvitationProjectCoordinate(createInvitationInput()),
    ).resolves.toBeUndefined();
    expect(withTenantScopeMock).not.toHaveBeenCalled();
  });

  it("accepts project-scoped invitations when the project belongs to the organization", async () => {
    withTenantScopeMock.mockImplementation(async (_scope, callback) =>
      callback({ sql: async () => [{ id: TEST_PROJECT_A_ID }] }),
    );

    await expect(
      assertInvitationProjectCoordinate(createInvitationInput({ projectId: PROJECT_A })),
    ).resolves.toBeUndefined();
    expect(recordInvitationCreateDeniedMock).not.toHaveBeenCalled();
  });

  it("denies missing and cross-organization project coordinates with auth denial shape", async () => {
    withTenantScopeMock.mockImplementation(async (_scope, callback) =>
      callback({ sql: async () => [] }),
    );

    await expect(
      assertInvitationProjectCoordinate(createInvitationInput({ projectId: PROJECT_B })),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });

    expect(recordInvitationCreateDeniedMock).toHaveBeenCalledWith({
      actorUserId: OWNER,
      organizationId: ORG,
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });
  });
});
