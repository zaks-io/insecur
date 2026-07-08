import { approvalRequestId, environmentId, projectId, userId } from "@insecur/domain";
import { describe, expect, it } from "vitest";
import { mapApprovalRequestDetailRow } from "../../src/approvals/approval-request-store-types.js";

const NOW = new Date("2026-07-08T00:00:00.000Z");

describe("mapApprovalRequestDetailRow", () => {
  it("brands ids and preserves metadata-only approval request fields", () => {
    const mapped = mapApprovalRequestDetailRow({
      id: "apr_00000000000000000000000001",
      purpose: "protected_promotion",
      status: "pending",
      projectId: "prj_00000000000000000000000001",
      environmentId: "env_00000000000000000000000001",
      requesterUserId: "usr_00000000000000000000000001",
      requesterMachineIdentityId: null,
      operationId: null,
      impactReviewFingerprint: "fp-old",
      commentLength: 8,
      createdAt: NOW,
      rollbackSecretId: null,
      rollbackToVersionId: null,
      rollbackPromoteRequested: false,
    });

    expect(mapped).toEqual({
      approvalRequestId: approvalRequestId.brand("apr_00000000000000000000000001"),
      purpose: "protected_promotion",
      status: "pending",
      projectId: projectId.brand("prj_00000000000000000000000001"),
      environmentId: environmentId.brand("env_00000000000000000000000001"),
      requesterUserId: userId.brand("usr_00000000000000000000000001"),
      requesterMachineIdentityId: null,
      operationId: null,
      impactReviewFingerprint: "fp-old",
      commentLength: 8,
      createdAt: NOW,
      rollbackSecretId: null,
      rollbackToVersionId: null,
      rollbackPromoteRequested: false,
    });
  });
});
