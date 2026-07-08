import { environmentId, organizationId, projectId, requestId, userId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/record-created-approval-request-audit.js", () => ({
  finalizeCreatedApprovalRequest: vi.fn().mockResolvedValue(undefined),
}));

import { createApprovalRequestWithAudit } from "../src/create-approval-request-with-audit.js";
import { finalizeCreatedApprovalRequest } from "../src/record-created-approval-request-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");

const auditScope = {
  auditActor: { type: "user", userId: USER } as const,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  requestId: REQ,
};

describe("createApprovalRequestWithAudit", () => {
  beforeEach(() => {
    vi.mocked(finalizeCreatedApprovalRequest).mockClear();
  });

  it("persists with a freshly generated approval request id and returns it with the persist result", async () => {
    const persist = vi.fn().mockResolvedValue("persist-result");

    const { approvalRequestId: generatedId, result } = await createApprovalRequestWithAudit({
      audit: auditScope,
      persist,
    });

    expect(generatedId).toMatch(/^apr_/);
    expect(result).toBe("persist-result");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(generatedId);
  });

  it("records the audit event for the same id it persisted, after persistence", async () => {
    const callOrder: string[] = [];
    const persist = vi.fn().mockImplementation(async () => {
      callOrder.push("persist");
      return undefined;
    });
    vi.mocked(finalizeCreatedApprovalRequest).mockImplementation(async () => {
      callOrder.push("audit");
    });

    const { approvalRequestId: generatedId } = await createApprovalRequestWithAudit({
      audit: auditScope,
      persist,
    });

    expect(callOrder).toEqual(["persist", "audit"]);
    expect(finalizeCreatedApprovalRequest).toHaveBeenCalledWith({
      ...auditScope,
      approvalRequestId: generatedId,
    });
  });

  it("generates a distinct approval request id per call", async () => {
    const persist = vi.fn().mockResolvedValue(undefined);

    const first = await createApprovalRequestWithAudit({ audit: auditScope, persist });
    const second = await createApprovalRequestWithAudit({ audit: auditScope, persist });

    expect(first.approvalRequestId).not.toBe(second.approvalRequestId);
  });

  it("does not record an audit event when persistence rejects", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("persist failed"));

    await expect(createApprovalRequestWithAudit({ audit: auditScope, persist })).rejects.toThrow(
      "persist failed",
    );

    expect(finalizeCreatedApprovalRequest).not.toHaveBeenCalled();
  });
});
