import { BUILT_IN_ROLE_PRESETS } from "@insecur/access";
import {
  invitationId,
  membershipId,
  ONBOARDING_ERROR_CODES,
  organizationId,
  projectId,
  teamId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPendingInvitationMock = vi.hoisted(() => vi.fn());
const membershipExistsForGrantMock = vi.hoisted(() => vi.fn().mockResolvedValue(false));
const withTenantScopeMock = vi.hoisted(() => vi.fn());
const acceptInvitationInTransactionMock = vi.hoisted(() => vi.fn());
const recordInvitationAcceptDeniedMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const recordInvitationAcceptedInTenantScopeMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

vi.mock("../src/invitation-store.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/invitation-store.js")>();
  return {
    ...actual,
    loadPendingInvitation: loadPendingInvitationMock,
    membershipExistsForGrant: membershipExistsForGrantMock,
    acceptInvitationInTransaction: acceptInvitationInTransactionMock,
  };
});

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope: withTenantScopeMock,
}));

vi.mock("../src/membership-management-audit.js", () => ({
  recordInvitationAcceptDenied: recordInvitationAcceptDeniedMock,
  recordInvitationAcceptedInTenantScope: recordInvitationAcceptedInTenantScopeMock,
}));

import { acceptInvitation } from "../src/accept-invitation.js";
import { MembershipManagementError } from "../src/membership-management-error.js";
import {
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_TEAM_A_ID,
  TEST_USER_ID,
} from "../../tenant-store/test/rls/test-ids.js";

const ORG = organizationId.brand(TEST_ORG_A_ID);
const PROJECT = projectId.brand(TEST_PROJECT_A_ID);
const TEAM = teamId.brand(TEST_TEAM_A_ID);
const INVITEE = userId.brand("usr_00000000000000000000000002");
const WRONG_ACCEPTOR = userId.brand(TEST_USER_ID);
const INV = invitationId.brand("inv_00000000000000000000000001");
const MEM = membershipId.brand("mem_00000000000000000000000080");

const pendingInvitation = {
  invitationId: INV,
  organizationId: ORG,
  teamId: TEAM,
  inviteeUserId: INVITEE,
  rolePreset: BUILT_IN_ROLE_PRESETS.developer,
  projectId: PROJECT,
};

function baseInput() {
  return {
    invitationId: INV,
    organizationId: ORG,
    acceptingUserId: INVITEE,
    membershipId: MEM,
  };
}

describe("acceptInvitation (unit)", () => {
  beforeEach(() => {
    loadPendingInvitationMock.mockReset();
    membershipExistsForGrantMock.mockReset();
    membershipExistsForGrantMock.mockResolvedValue(false);
    withTenantScopeMock.mockReset();
    acceptInvitationInTransactionMock.mockReset();
    recordInvitationAcceptDeniedMock.mockClear();
    recordInvitationAcceptedInTenantScopeMock.mockReset();
    recordInvitationAcceptedInTenantScopeMock.mockResolvedValue(undefined);
  });

  it("accepts a pending invitation and records the success audit inside the tenant scope", async () => {
    const scopedSql = { tag: "scoped-sql" };
    loadPendingInvitationMock.mockResolvedValue(pendingInvitation);
    acceptInvitationInTransactionMock.mockResolvedValue(pendingInvitation);
    withTenantScopeMock.mockImplementation(async (_scope, callback) =>
      callback({ sql: scopedSql }),
    );

    const result = await acceptInvitation(baseInput());

    expect(result).toEqual({
      invitationId: INV,
      membershipId: MEM,
      organizationId: ORG,
    });
    expect(recordInvitationAcceptedInTenantScopeMock).toHaveBeenCalledWith(scopedSql, {
      actorUserId: INVITEE,
      organizationId: ORG,
      invitationId: INV,
      membershipId: MEM,
    });
  });

  it("fails acceptance when the success audit cannot be recorded in the same scope", async () => {
    loadPendingInvitationMock.mockResolvedValue(pendingInvitation);
    acceptInvitationInTransactionMock.mockResolvedValue(pendingInvitation);
    withTenantScopeMock.mockImplementation(async (_scope, callback) =>
      callback({ sql: { tag: "scoped-sql" } }),
    );
    const auditFailure = new Error("audit write failed");
    recordInvitationAcceptedInTenantScopeMock.mockRejectedValue(auditFailure);

    await expect(acceptInvitation(baseInput())).rejects.toBe(auditFailure);
  });

  it("denies when the invitation is not pending", async () => {
    loadPendingInvitationMock.mockResolvedValue(null);

    await expect(acceptInvitation(baseInput())).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.invitationNotPending,
    });

    expect(recordInvitationAcceptDeniedMock).toHaveBeenCalledWith({
      actorUserId: INVITEE,
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.invitationNotPending,
      invitationId: INV,
    });
    expect(recordInvitationAcceptedInTenantScopeMock).not.toHaveBeenCalled();
  });

  it("denies when the accepting user is not the invitee", async () => {
    loadPendingInvitationMock.mockResolvedValue(pendingInvitation);

    await expect(
      acceptInvitation({
        ...baseInput(),
        acceptingUserId: WRONG_ACCEPTOR,
      }),
    ).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.invitationInviteeMismatch,
    });

    expect(recordInvitationAcceptDeniedMock).toHaveBeenCalledWith({
      actorUserId: WRONG_ACCEPTOR,
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.invitationInviteeMismatch,
      invitationId: INV,
    });
    await expect(
      acceptInvitation({
        ...baseInput(),
        acceptingUserId: WRONG_ACCEPTOR,
      }),
    ).rejects.toBeInstanceOf(MembershipManagementError);
  });

  it("denies when invitee already has membership for invitation scope", async () => {
    loadPendingInvitationMock.mockResolvedValue(pendingInvitation);
    membershipExistsForGrantMock.mockResolvedValue(true);

    await expect(acceptInvitation(baseInput())).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.membershipAlreadyExists,
    });

    expect(recordInvitationAcceptDeniedMock).toHaveBeenCalledWith({
      actorUserId: INVITEE,
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.membershipAlreadyExists,
      invitationId: INV,
    });
  });

  it("denies when acceptance loses the race", async () => {
    loadPendingInvitationMock.mockResolvedValue(pendingInvitation);
    acceptInvitationInTransactionMock.mockResolvedValue(null);
    withTenantScopeMock.mockImplementation(async (_scope, callback) =>
      callback({ sql: { tag: "scoped-sql" } }),
    );

    await expect(acceptInvitation(baseInput())).rejects.toMatchObject({
      code: ONBOARDING_ERROR_CODES.invitationNotPending,
    });
    expect(recordInvitationAcceptedInTenantScopeMock).not.toHaveBeenCalled();
  });
});
