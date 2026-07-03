import { auditEventId, projectId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { mergeOperationProgress } from "../src/merge-operation-progress.js";

const PRJ = projectId.brand("prj_00000000000000000000000001");
const AUD_REQUEST = auditEventId.brand("aud_00000000000000000000000001");
const AUD_CLEAR = auditEventId.brand("aud_00000000000000000000000002");
const AUD_CONSUME = auditEventId.brand("aud_00000000000000000000000003");

describe("mergeOperationProgress", () => {
  it("clears syncTargetLease when the patch sets it to null", () => {
    const merged = mergeOperationProgress(
      {
        syncTargetLease: {
          projectId: projectId.brand("prj_00000000000000000000000001"),
          providerKind: "github-actions",
          targetIdentity: "acme/widget",
          fencingToken: 2,
        },
      },
      { syncTargetLease: null },
    );
    expect(merged).not.toHaveProperty("syncTargetLease");
  });

  it("merges incomplete cause and abandoned flags from patches", () => {
    const merged = mergeOperationProgress({}, { cause: "action_required", abandoned: true });
    expect(merged.cause).toBe("action_required");
    expect(merged.abandoned).toBe(true);
  });

  it("replaces prior high-assurance challenge lifecycle when challengeId changes", () => {
    const consumedEvidence = {
      challengeId: "challenge_consumed_001",
      riskReasonCode: "risk.agent_step_up",
      projectId: PRJ,
      requestedAt: "2026-07-03T00:00:00.000Z",
      expiresAt: "2026-07-03T00:15:00.000Z",
      requestAuditEventId: AUD_REQUEST,
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: "usr_00000000000000000000000001",
      clearAuthenticationMethodCode: "auth.assurance.passkey",
      clearAuditEventId: AUD_CLEAR,
      consumedAt: "2026-07-03T00:10:00.000Z",
      consumeAuditEventId: AUD_CONSUME,
    };
    const freshEvidence = {
      challengeId: "challenge_pending_002",
      riskReasonCode: "risk.agent_step_up",
      projectId: PRJ,
      requestedAt: "2026-07-03T01:00:00.000Z",
      expiresAt: "2026-07-03T01:15:00.000Z",
      requestAuditEventId: auditEventId.brand("aud_00000000000000000000000004"),
    };

    const merged = mergeOperationProgress(
      { highAssuranceChallenge: consumedEvidence },
      { highAssuranceChallenge: freshEvidence },
    );

    expect(merged.highAssuranceChallenge).toEqual(freshEvidence);
  });

  it("merges high-assurance challenge fields for the same challengeId", () => {
    const pendingEvidence = {
      challengeId: "challenge_pending_001",
      riskReasonCode: "risk.agent_step_up",
      projectId: PRJ,
      requestedAt: "2026-07-03T00:00:00.000Z",
      expiresAt: "2026-07-03T00:15:00.000Z",
      requestAuditEventId: AUD_REQUEST,
    };
    const clearedPatch = {
      ...pendingEvidence,
      clearedAt: "2026-07-03T00:05:00.000Z",
      clearingUserId: "usr_00000000000000000000000001",
      clearAuthenticationMethodCode: "auth.assurance.passkey",
      clearAuditEventId: AUD_CLEAR,
    };

    const merged = mergeOperationProgress(
      { highAssuranceChallenge: pendingEvidence },
      { highAssuranceChallenge: clearedPatch },
    );

    expect(merged.highAssuranceChallenge).toEqual(clearedPatch);
  });
});
