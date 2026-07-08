import { generateCsrfToken, INSECUR_CSRF_COOKIE } from "@insecur/auth";
import { describe, expect, it } from "vitest";
import {
  parseRejectChallengeSubmission,
  rejectHighAssuranceChallengeForRequest,
} from "./reject-high-assurance-challenge.js";

describe("parseRejectChallengeSubmission", () => {
  it("accepts optional reason metadata", () => {
    expect(
      parseRejectChallengeSubmission({
        csrfToken: "tok",
        organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        reason: "not now",
      }),
    ).toEqual({
      csrfToken: "tok",
      organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      reason: "not now",
    });
  });

  it("rejects overlong reasons", () => {
    expect(
      parseRejectChallengeSubmission({
        csrfToken: "tok",
        organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        reason: "x".repeat(501),
      }),
    ).toBeNull();
  });
});

describe("rejectHighAssuranceChallengeForRequest", () => {
  it("denies a pending challenge over the scoped-token hop", async () => {
    const csrfToken = generateCsrfToken();
    const calls: string[] = [];
    const outcome = await rejectHighAssuranceChallengeForRequest(
      {
        cookieHeader: `${INSECUR_CSRF_COOKIE}=${csrfToken}`,
        resolveApi: async () => ({
          denyOrgHighAssuranceChallenge: async (organizationId, operationId) => {
            calls.push(`${organizationId}:${operationId}`);
            return { ok: true, data: { state: "canceled" } };
          },
        }),
      },
      {
        csrfToken,
        organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      },
    );

    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual(["org_01JZ8E2QYQAAAAAAAAAAAAAAAA:op_01JZ8E2QYQAAAAAAAAAAAAAAAA"]);
  });

  it("fails closed on CSRF mismatch", async () => {
    const outcome = await rejectHighAssuranceChallengeForRequest(
      {
        cookieHeader: `${INSECUR_CSRF_COOKIE}=${generateCsrfToken()}`,
        resolveApi: async () => ({
          denyOrgHighAssuranceChallenge: async () => ({ ok: true, data: {} }),
        }),
      },
      {
        csrfToken: generateCsrfToken(),
        organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA",
        operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
      },
    );

    expect(outcome).toEqual({ ok: false, code: "web.csrf_rejected" });
  });
});
