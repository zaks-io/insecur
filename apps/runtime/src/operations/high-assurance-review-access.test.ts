import {
  AUTHORIZATION_SCOPES,
  assertOrganizationMembership,
  resolveEffectiveAccess,
} from "@insecur/access";
import {
  AUTH_ERROR_CODES,
  OPERATION_ERROR_CODES,
  auditEventId,
  machineIdentityId,
  operationId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { toHighAssuranceChallengeReviewItem } from "@insecur/high-assurance";
import { getOperation, OperationStoreError, type OperationPollResult } from "@insecur/operations";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertHumanReviewActor,
  loadReviewableHighAssuranceChallenge,
  prepareMutationReviewAccess,
} from "./high-assurance-review-access.js";

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    assertOrganizationMembership: vi.fn(),
    resolveEffectiveAccess: vi.fn(),
  };
});

vi.mock("@insecur/operations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/operations")>();
  return {
    ...actual,
    getOperation: vi.fn(),
  };
});

const orgId = organizationId.brand("org_00000000000000000000000001");
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const operationIdValue = operationId.brand("op_00000000000000000000000001");
const actorUserId = userId.brand("usr_00000000000000000000000001");
const machineActor = machineIdentityId.brand("mach_00000000000000000000000003");

const pendingOperation: OperationPollResult = {
  operationId: operationIdValue,
  organizationId: orgId,
  state: "waiting_for_human",
  intentCode: "sync.run",
  progress: {
    highAssuranceChallenge: {
      challengeId: "challenge-001",
      projectId: projectIdValue,
      riskReasonCode: "high_assurance.risk.agent_step_up",
      requestedAt: "2026-06-24T00:00:00.000Z",
      expiresAt: "2026-06-24T01:00:00.000Z",
      requestingMachineIdentityId: machineActor,
      requestAuditEventId: auditEventId.brand("aud_00000000000000000000000001"),
    },
  },
  createdAt: "2026-06-24T00:00:00.000Z",
  updatedAt: "2026-06-24T00:00:00.000Z",
};

function effectiveAccessWithScopes(scopes: readonly string[]) {
  return {
    organizationId: orgId,
    projectId: projectIdValue,
    scopes,
  };
}

describe("highAssuranceReviewAccess", () => {
  beforeEach(() => {
    vi.mocked(assertOrganizationMembership).mockReset();
    vi.mocked(resolveEffectiveAccess).mockReset();
    vi.mocked(getOperation).mockReset();
    vi.mocked(assertOrganizationMembership).mockResolvedValue(undefined);
  });

  it("masks review reads when the actor lacks approval scope at the challenge coordinate", async () => {
    vi.mocked(getOperation).mockResolvedValue(pendingOperation);
    vi.mocked(resolveEffectiveAccess).mockResolvedValue(
      effectiveAccessWithScopes([AUTHORIZATION_SCOPES.organizationRead]),
    );

    await expect(
      loadReviewableHighAssuranceChallenge({
        accessActor: { type: "user", userId: actorUserId },
        organizationId: orgId,
        operationId: operationIdValue,
      }),
    ).rejects.toMatchObject({
      code: OPERATION_ERROR_CODES.notFound,
      message: "operation not found",
    });
  });

  it("rejects machine actors before resolving mutation review access", async () => {
    await expect(
      prepareMutationReviewAccess({
        accessActor: {
          type: "machine",
          machineIdentityId: machineActor,
          tokenScope: { organizationId: orgId, projectId: projectIdValue },
          credentialScopes: [],
        },
        organizationId: orgId,
        projectId: projectIdValue,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(resolveEffectiveAccess).not.toHaveBeenCalled();
  });

  it("returns a review item when the actor has approval scope at the challenge coordinate", async () => {
    vi.mocked(getOperation).mockResolvedValue(pendingOperation);
    vi.mocked(resolveEffectiveAccess).mockResolvedValue(
      effectiveAccessWithScopes([AUTHORIZATION_SCOPES.approvalApprove]),
    );

    await expect(
      loadReviewableHighAssuranceChallenge({
        accessActor: { type: "user", userId: actorUserId },
        organizationId: orgId,
        operationId: operationIdValue,
      }),
    ).resolves.toEqual(toHighAssuranceChallengeReviewItem(pendingOperation));
  });

  it("rejects non-user actors through assertHumanReviewActor", async () => {
    await expect(
      assertHumanReviewActor(
        {
          type: "machine",
          machineIdentityId: machineActor,
          tokenScope: { organizationId: orgId, projectId: projectIdValue },
          credentialScopes: [],
        },
        orgId,
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(assertOrganizationMembership).not.toHaveBeenCalled();
  });

  it("preserves store not-found errors when the operation does not exist", async () => {
    vi.mocked(getOperation).mockRejectedValue(
      new OperationStoreError(OPERATION_ERROR_CODES.notFound, "operation not found"),
    );

    await expect(
      loadReviewableHighAssuranceChallenge({
        accessActor: { type: "user", userId: actorUserId },
        organizationId: orgId,
        operationId: operationIdValue,
      }),
    ).rejects.toBeInstanceOf(OperationStoreError);
  });
});
