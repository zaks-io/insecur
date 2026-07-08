import { describe, expect, it } from "vitest";
import {
  consoleApprovalRouteKindFromId,
  parseHighAssuranceChallengeDetailEntry,
  parseOrgHighAssuranceChallengeDetailBody,
} from "./approval-detail-parse.js";
import { parseOrgApprovalRequestDetailBody } from "./approval-request-detail-parse.js";

const DETAIL_ENTRY = {
  operationId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  intentCode: "sync.run",
  challengeId: "challenge-001",
  projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  environmentId: "env_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  riskReasonCode: "high_assurance.risk.agent_step_up",
  requestedAt: "2026-07-01T00:00:00.000Z",
  expiresAt: "2026-07-01T01:00:00.000Z",
  requestingMachineIdentityId: "mach_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  status: "pending",
  hasClearedEvidence: false,
};

describe("consoleApprovalRouteKindFromId", () => {
  it("resolves High-Assurance Challenge and Approval Request prefixes", () => {
    expect(consoleApprovalRouteKindFromId("op_01JZ8E2QYQAAAAAAAAAAAAAAAA")).toBe(
      "high_assurance_challenge",
    );
    expect(consoleApprovalRouteKindFromId("apr_01JZ8E2QYQAAAAAAAAAAAAAAAA")).toBe(
      "approval_request",
    );
    expect(consoleApprovalRouteKindFromId("org_01JZ8E2QYQAAAAAAAAAAAAAAAA")).toBe("unknown");
  });
});

describe("parseOrgHighAssuranceChallengeDetailBody", () => {
  it("parses metadata evidence for one challenge", () => {
    expect(
      parseOrgHighAssuranceChallengeDetailBody({ ok: true, data: { challenge: DETAIL_ENTRY } }),
    ).toMatchObject({
      kind: "high_assurance_challenge",
      id: DETAIL_ENTRY.operationId,
      challengeId: "challenge-001",
      status: "pending",
    });
  });

  it("fails closed on malformed envelopes", () => {
    expect(parseOrgHighAssuranceChallengeDetailBody({ ok: false })).toBeNull();
    expect(parseHighAssuranceChallengeDetailEntry({ ...DETAIL_ENTRY, status: "bogus" })).toBeNull();
  });
});

const APPROVAL_REQUEST_DETAIL_ENTRY = {
  approvalRequestId: "apr_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  purpose: "protected_promotion",
  status: "pending",
  projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  environmentId: "env_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  requestedAt: "2026-07-01T00:00:00.000Z",
  operationId: null,
  requestingUserId: "usr_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  requestingMachineIdentityId: null,
  commentLength: 12,
  rollbackSecretId: null,
  rollbackToVersionId: null,
  rollbackPromoteRequested: false,
  impactReview: {
    fingerprintAtCreation: "fp-old",
    currentFingerprint: "fp-current",
    isStale: true,
    draftVersions: [],
    delivery: { runtimeInjectionPolicies: [], providerSyncImpact: [] },
  },
};

describe("parseOrgApprovalRequestDetailBody", () => {
  it("parses metadata evidence for one approval request", () => {
    expect(
      parseOrgApprovalRequestDetailBody({
        ok: true,
        data: { approvalRequest: APPROVAL_REQUEST_DETAIL_ENTRY },
      }),
    ).toMatchObject({
      kind: "approval_request",
      id: APPROVAL_REQUEST_DETAIL_ENTRY.approvalRequestId,
      status: "pending",
      impactReview: { isStale: true },
    });
  });

  it("fails closed on malformed envelopes", () => {
    expect(parseOrgApprovalRequestDetailBody({ ok: false })).toBeNull();
    expect(
      parseOrgApprovalRequestDetailBody({
        ok: true,
        data: { approvalRequest: { ...APPROVAL_REQUEST_DETAIL_ENTRY, status: "approved_applied" } },
      }),
    ).toBeNull();
  });
});
