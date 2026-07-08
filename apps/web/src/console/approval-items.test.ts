import { describe, expect, it } from "vitest";
import {
  consoleApprovalItemKindFromId,
  parseOrgHighAssuranceChallengesBody,
  type ConsoleHighAssuranceChallengeItem,
} from "./approval-items.js";
import { parseOrgApprovalRequestsBody } from "./approval-request-items-parse.js";

const HAC_ITEM: ConsoleHighAssuranceChallengeItem = {
  kind: "high_assurance_challenge",
  id: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  intentCode: "sync.run",
  projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  environmentId: "env_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  riskReasonCode: "high_assurance.risk.agent_step_up",
  requestedAt: "2026-07-01T00:00:00.000Z",
  expiresAt: "2026-07-01T01:00:00.000Z",
  requestingMachineIdentityId: "mach_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  requestingUserId: null,
};

const HAC_ENVELOPE_ROW = {
  operationId: HAC_ITEM.id,
  intentCode: HAC_ITEM.intentCode,
  challengeId: "challenge-001",
  projectId: HAC_ITEM.projectId,
  environmentId: HAC_ITEM.environmentId,
  riskReasonCode: HAC_ITEM.riskReasonCode,
  requestedAt: HAC_ITEM.requestedAt,
  expiresAt: HAC_ITEM.expiresAt,
  requestingMachineIdentityId: HAC_ITEM.requestingMachineIdentityId,
  status: "pending",
  hasClearedEvidence: false,
};

describe("consoleApprovalItemKindFromId", () => {
  it("discriminates bounded operations and approval requests by opaque ID prefix", () => {
    expect(consoleApprovalItemKindFromId("op_01JZ8E2QYQAAAAAAAAAAAAAAAA")).toBe(
      "high_assurance_challenge",
    );
    expect(consoleApprovalItemKindFromId("apr_01JZ8E2QYQAAAAAAAAAAAAAAAA")).toBe(
      "approval_request",
    );
    expect(consoleApprovalItemKindFromId("org_01JZ8E2QYQAAAAAAAAAAAAAAAA")).toBeNull();
  });
});

describe("parseOrgHighAssuranceChallengesBody", () => {
  it("parses pending challenge metadata into the generic inbox item shape", () => {
    expect(
      parseOrgHighAssuranceChallengesBody({
        ok: true,
        data: { challenges: [HAC_ENVELOPE_ROW] },
      }),
    ).toEqual({ items: [HAC_ITEM] });
  });

  it("fails closed on malformed envelopes and non-operation ids", () => {
    expect(parseOrgHighAssuranceChallengesBody({ ok: false })).toBeNull();
    expect(
      parseOrgHighAssuranceChallengesBody({
        ok: true,
        data: {
          challenges: [{ ...HAC_ENVELOPE_ROW, operationId: "apr_01JZ8E2QYQAAAAAAAAAAAAAAAA" }],
        },
      }),
    ).toBeNull();
  });

  it("parses an empty list as a valid authorized read", () => {
    expect(parseOrgHighAssuranceChallengesBody({ ok: true, data: { challenges: [] } })).toEqual({
      items: [],
    });
  });
});

const APPROVAL_REQUEST_ROW = {
  approvalRequestId: "apr_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  purpose: "protected_promotion",
  status: "pending",
  projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  environmentId: "env_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  requestedAt: "2026-07-01T00:00:00.000Z",
  operationId: null,
  requestingUserId: "usr_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  requestingMachineIdentityId: null,
};

describe("parseOrgApprovalRequestsBody", () => {
  it("parses pending approval requests into the generic inbox item shape", () => {
    expect(
      parseOrgApprovalRequestsBody({
        ok: true,
        data: { approvalRequests: [APPROVAL_REQUEST_ROW] },
      }),
    ).toEqual({
      items: [
        {
          kind: "approval_request",
          id: APPROVAL_REQUEST_ROW.approvalRequestId,
          purpose: APPROVAL_REQUEST_ROW.purpose,
          projectId: APPROVAL_REQUEST_ROW.projectId,
          environmentId: APPROVAL_REQUEST_ROW.environmentId,
          requestedAt: APPROVAL_REQUEST_ROW.requestedAt,
          status: "pending",
          operationId: null,
          requestingUserId: APPROVAL_REQUEST_ROW.requestingUserId,
          requestingMachineIdentityId: null,
        },
      ],
    });
  });

  it("fails closed on malformed envelopes and non-approval ids", () => {
    expect(parseOrgApprovalRequestsBody({ ok: false })).toBeNull();
    expect(
      parseOrgApprovalRequestsBody({
        ok: true,
        data: {
          approvalRequests: [
            { ...APPROVAL_REQUEST_ROW, approvalRequestId: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA" },
          ],
        },
      }),
    ).toBeNull();
  });
});
