import {
  environmentId,
  HIGH_ASSURANCE_ERROR_CODES,
  operationId,
  organizationId,
  projectId,
  userId,
} from "@insecur/domain";
import { HighAssuranceChallengeError } from "@insecur/high-assurance";
import { describe, expect, it, vi } from "vitest";

vi.mock("@insecur/access", () => ({
  AUTHORIZATION_SCOPES: {
    secretProtectedDraftWrite: "secret:protected_draft_write",
  },
}));

vi.mock("@insecur/high-assurance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/high-assurance")>();
  return {
    ...actual,
    HIGH_ASSURANCE_RISK_REASON_CODES: {
      protectedPromotion: "protected_promotion",
      protectedRollback: "protected_rollback",
    },
    consumeHighAssuranceEvidence: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@insecur/operations", () => ({
  getOperation: vi.fn(),
}));

import { consumeHighAssuranceEvidence } from "@insecur/high-assurance";
import { getOperation } from "@insecur/operations";
import { consumeProtectedSecretMutationEvidence } from "../src/consume-protected-secret-mutation-evidence.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000099");

describe("consumeProtectedSecretMutationEvidence", () => {
  it("rejects mismatched risk reasons", async () => {
    vi.mocked(getOperation).mockResolvedValue({
      progress: { highAssuranceChallenge: { riskReasonCode: "protected_rollback" } },
    } as never);

    await expect(
      consumeProtectedSecretMutationEvidence(
        {
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          operationId: OP,
          actorUserId: USER,
          mutationKind: "promotion",
        },
        vi.fn(),
      ),
    ).rejects.toMatchObject({ code: HIGH_ASSURANCE_ERROR_CODES.operationMismatch });
  });

  it("consumes evidence for matching promotion operations", async () => {
    vi.mocked(getOperation).mockResolvedValue({
      progress: { highAssuranceChallenge: { riskReasonCode: "protected_promotion" } },
    } as never);

    await expect(
      consumeProtectedSecretMutationEvidence(
        {
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          operationId: OP,
          actorUserId: USER,
          mutationKind: "promotion",
        },
        vi.fn(),
      ),
    ).resolves.toBeUndefined();

    expect(consumeHighAssuranceEvidence).toHaveBeenCalled();
  });

  it("invokes onDenied for challenge errors", async () => {
    const challengeError = new HighAssuranceChallengeError(
      HIGH_ASSURANCE_ERROR_CODES.evidenceMissing,
      "missing",
    );
    vi.mocked(getOperation).mockResolvedValue({
      progress: { highAssuranceChallenge: { riskReasonCode: "protected_promotion" } },
    } as never);
    vi.mocked(consumeHighAssuranceEvidence).mockRejectedValue(challengeError);
    const onDenied = vi.fn().mockResolvedValue(undefined);

    await expect(
      consumeProtectedSecretMutationEvidence(
        {
          organizationId: ORG,
          projectId: PROJECT,
          environmentId: ENV,
          operationId: OP,
          actorUserId: USER,
          mutationKind: "promotion",
        },
        onDenied,
      ),
    ).rejects.toBe(challengeError);

    expect(onDenied).toHaveBeenCalledWith(challengeError);
  });
});
