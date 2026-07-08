import { describe, expect, it } from "vitest";
import {
  clearHighAssuranceChallengeForRequest,
  parseClearChallengeOutcome,
  parseClearChallengeSubmission,
} from "./clear-high-assurance-challenge.js";

describe("parseClearChallengeSubmission", () => {
  it("accepts step-up PKCE evidence and optional environmentId", () => {
    expect(
      parseClearChallengeSubmission({
        organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        environmentId: "env_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        stepUpCode: "code_step_up",
        stepUpCodeVerifier: "verifier_step_up",
      }),
    ).toEqual({
      organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      environmentId: "env_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      stepUpCode: "code_step_up",
      stepUpCodeVerifier: "verifier_step_up",
    });
  });

  it("rejects malformed submissions", () => {
    expect(
      parseClearChallengeSubmission({
        organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      }),
    ).toBeNull();
  });
});

describe("parseClearChallengeOutcome", () => {
  it("parses cleared metadata receipt", () => {
    expect(
      parseClearChallengeOutcome({
        ok: true,
        data: {
          operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
          challengeId: "challenge-001",
          clearedAt: "2026-07-08T00:00:00.000Z",
          clearingUserId: "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
        },
      }),
    ).toEqual({
      ok: true,
      operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      challengeId: "challenge-001",
      clearedAt: "2026-07-08T00:00:00.000Z",
      clearingUserId: "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
    });
  });

  it("parses catalog error codes", () => {
    expect(
      parseClearChallengeOutcome({
        ok: false,
        error: { code: "high_assurance.session_assurance_failed" },
      }),
    ).toEqual({ ok: false, code: "high_assurance.session_assurance_failed" });
  });
});

describe("clearHighAssuranceChallengeForRequest", () => {
  it("clears a pending challenge with server-verified step-up evidence", async () => {
    const calls: unknown[] = [];
    const outcome = await clearHighAssuranceChallengeForRequest(
      {
        clearOrgHighAssuranceChallenge: async (organizationId, operationId, body) => {
          calls.push({ organizationId, operationId, body });
          return {
            ok: true,
            data: {
              operationId,
              challengeId: "challenge-001",
              clearedAt: "2026-07-08T00:00:00.000Z",
            },
          };
        },
      },
      {
        organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        stepUpCode: "code_step_up",
        stepUpCodeVerifier: "verifier_step_up",
      },
    );

    expect(outcome).toEqual({
      ok: true,
      operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      challengeId: "challenge-001",
      clearedAt: "2026-07-08T00:00:00.000Z",
    });
    expect(calls[0]).toMatchObject({
      organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      body: {
        projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        stepUpCode: "code_step_up",
        stepUpCodeVerifier: "verifier_step_up",
      },
    });
  });

  it("surfaces stale step-up rejection from the API hop", async () => {
    const outcome = await clearHighAssuranceChallengeForRequest(
      {
        clearOrgHighAssuranceChallenge: async () => ({
          ok: false,
          error: { code: "high_assurance.session_assurance_failed" },
        }),
      },
      {
        organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        stepUpCode: "code_step_up",
        stepUpCodeVerifier: "verifier_step_up",
      },
    );

    expect(outcome).toEqual({ ok: false, code: "high_assurance.session_assurance_failed" });
  });
});
