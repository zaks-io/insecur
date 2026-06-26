import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  invitationId,
  ONBOARDING_ERROR_CODES,
  organizationId,
  projectId,
  teamId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assertInvitationRolePresetMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const assertInvitationProjectCoordinateMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
const assertMembershipManageScopeMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const membershipExistsForGrantMock = vi.hoisted(() => vi.fn().mockResolvedValue(false));
const loadDefaultTeamIdMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue("team_00000000000000000000000001"),
);
const insertPendingInvitationMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordInvitationCreateDeniedMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordInvitationCreatedMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const auditAccessDenialOnFailureMock = vi.hoisted(() =>
  vi.fn().mockImplementation(async (error, handlers) => {
    if (handlers.isAccessDenied(error)) {
      await handlers.recordDenied();
    }
  }),
);

vi.mock("../src/assert-invitation-create-input.js", () => ({
  assertInvitationRolePreset: assertInvitationRolePresetMock,
  assertInvitationProjectCoordinate: assertInvitationProjectCoordinateMock,
}));

vi.mock("../src/assert-membership-manage-scope.js", () => ({
  assertMembershipManageScope: assertMembershipManageScopeMock,
}));

vi.mock("../src/invitation-store.js", () => ({
  membershipExistsForGrant: membershipExistsForGrantMock,
  loadDefaultTeamId: loadDefaultTeamIdMock,
  insertPendingInvitation: insertPendingInvitationMock,
}));

vi.mock("../src/membership-management-audit.js", () => ({
  recordInvitationCreateDenied: recordInvitationCreateDeniedMock,
  recordInvitationCreated: recordInvitationCreatedMock,
}));

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    auditAccessDenialOnFailure: auditAccessDenialOnFailureMock,
  };
});

import { createInvitation } from "../src/create-invitation.js";
import { MembershipManagementError } from "../src/membership-management-error.js";
import {
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const ORG = organizationId.brand(TEST_ORG_A_ID);
const PROJECT = projectId.brand(TEST_PROJECT_A_ID);
const OWNER = userId.brand(TEST_USER_ID);
const INVITEE = userId.brand("usr_00000000000000000000000002");
const INV = invitationId.brand("inv_00000000000000000000000001");
const DEFAULT_TEAM = teamId.brand("team_00000000000000000000000001");

function baseInput() {
  return {
    actor: { type: "user" as const, userId: OWNER },
    organizationId: ORG,
    inviteeUserId: INVITEE,
    rolePreset: BUILT_IN_ROLE_PRESETS.developer,
    projectId: PROJECT,
    invitationId: INV,
  };
}

describe("createInvitation (unit)", () => {
  beforeEach(() => {
    assertInvitationRolePresetMock.mockClear();
    assertInvitationProjectCoordinateMock.mockClear();
    assertMembershipManageScopeMock.mockReset();
    assertMembershipManageScopeMock.mockResolvedValue(undefined);
    membershipExistsForGrantMock.mockReset();
    membershipExistsForGrantMock.mockResolvedValue(false);
    loadDefaultTeamIdMock.mockClear();
    insertPendingInvitationMock.mockReset();
    insertPendingInvitationMock.mockResolvedValue(undefined);
    recordInvitationCreateDeniedMock.mockClear();
    recordInvitationCreatedMock.mockClear();
    auditAccessDenialOnFailureMock.mockClear();
  });

  it("creates a pending invitation after validation and scope checks", async () => {
    const result = await createInvitation(baseInput());

    expect(result).toMatchObject({
      invitationId: INV,
      organizationId: ORG,
      teamId: DEFAULT_TEAM,
      inviteeUserId: INVITEE,
      rolePreset: BUILT_IN_ROLE_PRESETS.developer,
      projectId: PROJECT,
    });
    expect(insertPendingInvitationMock).toHaveBeenCalledOnce();
    expect(recordInvitationCreatedMock).toHaveBeenCalledWith({
      actorUserId: OWNER,
      organizationId: ORG,
      invitationId: INV,
    });
  });

  it("denies when invitee already has membership for the scope", async () => {
    membershipExistsForGrantMock.mockResolvedValue(true);

    await expect(createInvitation(baseInput())).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.membershipAlreadyExists,
    });

    expect(recordInvitationCreateDeniedMock).toHaveBeenCalledWith({
      actorUserId: OWNER,
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.membershipAlreadyExists,
    });
    expect(insertPendingInvitationMock).not.toHaveBeenCalled();
  });

  it("maps unique constraint violations to resource conflict", async () => {
    insertPendingInvitationMock.mockRejectedValue({ code: "23505" });

    await expect(createInvitation(baseInput())).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.resourceConflict,
      organizationId: ORG,
      invitationId: INV,
    });
    expect(recordInvitationCreateDeniedMock).toHaveBeenCalled();
    expect(recordInvitationCreatedMock).not.toHaveBeenCalled();
  });

  it("records access denial audit when membership manage scope is missing", async () => {
    const scopeError = new MembershipManagementError(
      AUTH_ERROR_CODES.insufficientScope,
      "membership management scope required",
      ORG,
    );
    assertMembershipManageScopeMock.mockRejectedValue(scopeError);

    await expect(createInvitation(baseInput())).rejects.toBe(scopeError);

    expect(auditAccessDenialOnFailureMock).toHaveBeenCalled();
    expect(recordInvitationCreateDeniedMock).toHaveBeenCalledWith({
      actorUserId: OWNER,
      organizationId: ORG,
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });
  });

  it("rethrows non-unique persistence failures", async () => {
    const persistenceError = new Error("database unavailable");
    insertPendingInvitationMock.mockRejectedValue(persistenceError);

    await expect(createInvitation(baseInput())).rejects.toBe(persistenceError);
    expect(recordInvitationCreatedMock).not.toHaveBeenCalled();
  });
});
