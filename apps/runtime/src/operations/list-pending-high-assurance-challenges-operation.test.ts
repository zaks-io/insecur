import {
  AUTH_ERROR_CODES,
  machineIdentityId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";
import type { HighAssuranceChallengeReviewItem } from "@insecur/high-assurance";
import { listPendingHighAssuranceChallengesOperation } from "./list-pending-high-assurance-challenges-operation.js";

vi.mock("@insecur/high-assurance", () => ({
  listPendingHighAssuranceChallenges: vi.fn(),
}));

vi.mock("./high-assurance-review-access.js", () => ({
  assertHumanReviewActor: vi.fn(),
  authorizeHighAssuranceReviewRead: vi.fn(),
  filterReviewItemsByEffectiveAccess: vi.fn(),
}));

import { listPendingHighAssuranceChallenges } from "@insecur/high-assurance";
import {
  assertHumanReviewActor,
  authorizeHighAssuranceReviewRead,
  filterReviewItemsByEffectiveAccess,
} from "./high-assurance-review-access.js";

const orgId = organizationId.brand("org_00000000000000000000000001");
const projectIdValue = projectId.brand("prj_00000000000000000000000001");
const actorUserId = userId.brand("usr_00000000000000000000000001");
const reqId = requestId.brand("req_00000000000000000000000001");
const machineActor = machineIdentityId.brand("mach_00000000000000000000000003");

const pendingChallenge = {
  operationId: "op_00000000000000000000000001",
  intentCode: "sync.run",
  challengeId: "challenge-001",
  projectId: "prj_00000000000000000000000001",
  riskReasonCode: "high_assurance.risk.agent_step_up",
  requestedAt: "2026-06-24T00:00:00.000Z",
  expiresAt: "2026-06-24T01:00:00.000Z",
  status: "pending",
  hasClearedEvidence: false,
} as HighAssuranceChallengeReviewItem;

describe("listPendingHighAssuranceChallengesOperation", () => {
  it("rejects machine actors before listing pending challenges", async () => {
    vi.mocked(assertHumanReviewActor).mockRejectedValue(
      Object.assign(new Error("Missing required permission."), {
        code: AUTH_ERROR_CODES.insufficientScope,
      }),
    );

    await expect(
      listPendingHighAssuranceChallengesOperation({
        input: { organizationId: orgId, actorToken: "token", requestId: reqId },
        auditActor: { type: "machine", machineIdentityId: machineActor },
        accessActor: {
          type: "machine",
          machineIdentityId: machineActor,
          tokenScope: { organizationId: orgId, projectId: projectIdValue },
          credentialScopes: [],
        },
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });

    expect(listPendingHighAssuranceChallenges).not.toHaveBeenCalled();
  });

  it("returns an empty inbox when pending challenges are not visible to the caller", async () => {
    vi.mocked(assertHumanReviewActor).mockResolvedValue(undefined);
    vi.mocked(authorizeHighAssuranceReviewRead).mockResolvedValue(undefined);
    vi.mocked(listPendingHighAssuranceChallenges).mockResolvedValue([pendingChallenge]);
    vi.mocked(filterReviewItemsByEffectiveAccess).mockResolvedValue([]);

    await expect(
      listPendingHighAssuranceChallengesOperation({
        input: { organizationId: orgId, actorToken: "token", requestId: reqId },
        auditActor: { type: "user", userId: actorUserId },
        accessActor: { type: "user", userId: actorUserId },
      }),
    ).resolves.toEqual({ challenges: [] });
  });
});
