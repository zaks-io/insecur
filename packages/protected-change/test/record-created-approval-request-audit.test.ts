import {
  approvalRequestId,
  environmentId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { describe, expect, it, vi } from "vitest";

vi.mock("@insecur/audit", () => ({
  recordApprovalAudit: vi.fn().mockResolvedValue(undefined),
}));

import { recordApprovalAudit } from "@insecur/audit";
import { finalizeCreatedApprovalRequest } from "../src/record-created-approval-request-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const APPROVAL = approvalRequestId.brand("req_00000000000000000000000002");

describe("finalizeCreatedApprovalRequest", () => {
  it("records a metadata-only approval audit event", async () => {
    await finalizeCreatedApprovalRequest({
      actor: { type: "user", userId: USER },
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      approvalRequestId: APPROVAL,
      requestId: REQ,
    });

    expect(recordApprovalAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "request_created",
        outcome: "success",
        resource: { type: "approval_request", id: APPROVAL },
      }),
    );
  });
});
