import { FIRST_VALUE_AUDIT_EVENT_CODES } from "@insecur/audit";
import {
  invitationId,
  membershipId,
  ONBOARDING_ERROR_CODES,
  organizationId,
  requestId,
  teamId,
  userId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    recordActionAudit: vi.fn().mockResolvedValue({ auditEventId: "aud_test" }),
  };
});

import { recordActionAudit } from "@insecur/audit";
import {
  recordInvitationAcceptDenied,
  recordInvitationAccepted,
  recordInvitationCreateDenied,
  recordInvitationCreated,
  recordOperatorOrganizationCreated,
  recordOperatorOrganizationDenied,
} from "../src/membership-management-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const INVITEE = userId.brand("usr_00000000000000000000000002");
const TEAM = teamId.brand("team_00000000000000000000000001");
const INV = invitationId.brand("inv_00000000000000000000000001");
const MEM = membershipId.brand("mem_00000000000000000000000001");
const REQUEST = { requestId: requestId.brand("req_00000000000000000000000001") };

const recordMock = vi.mocked(recordActionAudit);

describe("membership-management audit envelopes", () => {
  it("records operator organization denied with metadata-only fields", async () => {
    recordMock.mockClear();

    await recordOperatorOrganizationDenied({
      operatorUserId: INVITEE,
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.notInstanceOperator,
      request: REQUEST,
    });

    expect(recordMock).toHaveBeenCalledWith({
      outcome: "denied",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationDenied,
      actor: { type: "user", userId: INVITEE },
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.notInstanceOperator,
      request: REQUEST,
    });
  });

  it("records operator organization created with organization resource", async () => {
    recordMock.mockClear();

    await recordOperatorOrganizationCreated({
      operatorUserId: USER,
      organizationId: ORG,
      defaultTeamId: TEAM,
    });

    expect(recordMock).toHaveBeenCalledWith({
      outcome: "success",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingOperatorOrganizationCreated,
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      resource: { type: "organization", id: ORG },
    });
  });

  it("records invitation created with invitation resource", async () => {
    recordMock.mockClear();

    await recordInvitationCreated({
      actorUserId: USER,
      organizationId: ORG,
      invitationId: INV,
      request: REQUEST,
    });

    expect(recordMock).toHaveBeenCalledWith({
      outcome: "success",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreated,
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      resource: { type: "invitation", id: INV },
      request: REQUEST,
    });
  });

  it("records invitation create denied without resource", async () => {
    recordMock.mockClear();

    await recordInvitationCreateDenied({
      actorUserId: USER,
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.invitationInvalid,
    });

    expect(recordMock).toHaveBeenCalledWith({
      outcome: "denied",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationCreateDenied,
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.invitationInvalid,
    });
  });

  it("records invitation accepted with invitation resource", async () => {
    recordMock.mockClear();

    await recordInvitationAccepted({
      actorUserId: INVITEE,
      organizationId: ORG,
      invitationId: INV,
      membershipId: MEM,
    });

    expect(recordMock).toHaveBeenCalledWith({
      outcome: "success",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAccepted,
      actor: { type: "user", userId: INVITEE },
      organizationId: ORG,
      resource: { type: "invitation", id: INV },
    });
  });

  it("records invitation accept denied with optional invitation resource", async () => {
    recordMock.mockClear();

    await recordInvitationAcceptDenied({
      actorUserId: INVITEE,
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.invitationInviteeMismatch,
      invitationId: INV,
      request: REQUEST,
    });

    expect(recordMock).toHaveBeenCalledWith({
      outcome: "denied",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied,
      actor: { type: "user", userId: INVITEE },
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.invitationInviteeMismatch,
      resource: { type: "invitation", id: INV },
      request: REQUEST,
    });
  });

  it("omits invitation resource on accept denied when invitation id is absent", async () => {
    recordMock.mockClear();

    await recordInvitationAcceptDenied({
      actorUserId: INVITEE,
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.invitationNotPending,
    });

    expect(recordMock).toHaveBeenCalledWith({
      outcome: "denied",
      eventCode: FIRST_VALUE_AUDIT_EVENT_CODES.onboardingInvitationAcceptDenied,
      actor: { type: "user", userId: INVITEE },
      organizationId: ORG,
      reasonCode: ONBOARDING_ERROR_CODES.invitationNotPending,
    });
    expect(recordMock.mock.calls[0]?.[0]).not.toHaveProperty("resource");
  });
});
