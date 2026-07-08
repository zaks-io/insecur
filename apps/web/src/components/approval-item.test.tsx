import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalItem } from "../components/approval-item.js";
import type {
  ConsoleApprovalRequestItem,
  ConsoleHighAssuranceChallengeItem,
} from "../console/approval-items.js";

export const HIGH_ASSURANCE_CHALLENGE_FIXTURE: ConsoleHighAssuranceChallengeItem = {
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

export const APPROVAL_REQUEST_FIXTURE: ConsoleApprovalRequestItem = {
  kind: "approval_request",
  id: "req_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  requestedAt: "2026-07-02T00:00:00.000Z",
  status: "pending",
};

describe("ApprovalItem", () => {
  it("renders a High-Assurance Challenge inbox row with a deep link when orgId is provided", () => {
    const orgId = "org_01JZ8E2QYQAAAAAAAAAAAAAAAA";
    const html = renderToStaticMarkup(
      <ApprovalItem item={HIGH_ASSURANCE_CHALLENGE_FIXTURE} orgId={orgId} />,
    );

    expect(html).toContain("High-Assurance Challenge");
    expect(html).toContain(`/orgs/${orgId}/approvals/${HIGH_ASSURANCE_CHALLENGE_FIXTURE.id}`);
    expect(html).toContain(HIGH_ASSURANCE_CHALLENGE_FIXTURE.intentCode);
    expect(html).toContain(HIGH_ASSURANCE_CHALLENGE_FIXTURE.riskReasonCode);
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Reject");
  });

  it("renders an Approval Request inbox row without rework", () => {
    const html = renderToStaticMarkup(<ApprovalItem item={APPROVAL_REQUEST_FIXTURE} />);

    expect(html).toContain("Approval Request");
    expect(html).toContain(APPROVAL_REQUEST_FIXTURE.id);
    expect(html).toContain("Pending approval request");
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Reject");
  });
});
