import {
  environmentId,
  operationId,
  organizationId,
  projectId,
  requestId,
  secretId,
  secretVersionId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRollbackApprovalRequestStoreFn = vi.fn();

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope: vi.fn((_scope: unknown, run: (ctx: { db: unknown }) => unknown) =>
    run({ db: {} }),
  ),
  TenantApprovalRequestStore: vi.fn(function TenantApprovalRequestStore() {
    return { createRollbackApprovalRequest: createRollbackApprovalRequestStoreFn };
  }),
}));

vi.mock("../src/record-created-approval-request-audit.js", () => ({
  finalizeCreatedApprovalRequest: vi.fn().mockResolvedValue(undefined),
}));

import { createRollbackApprovalRequest } from "../src/create-rollback-approval-request.js";
import { finalizeCreatedApprovalRequest } from "../src/record-created-approval-request-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const NEW_SECRET_VERSION = secretVersionId.brand("sv_00000000000000000000000001");

const baseInput = {
  actor: { type: "user", userId: USER } as const,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  secretId: SECRET,
  toVersionNumber: 3,
  newSecretVersionId: NEW_SECRET_VERSION,
  impactReviewFingerprint: "impact-fingerprint-v1",
  requestId: REQ,
};

describe("createRollbackApprovalRequest", () => {
  beforeEach(() => {
    createRollbackApprovalRequestStoreFn.mockReset().mockResolvedValue(undefined);
    vi.mocked(finalizeCreatedApprovalRequest).mockClear();
  });

  it("creates a promote-requested rollback request with a single draft version for the target secret", async () => {
    const createdId = await createRollbackApprovalRequest(baseInput);

    expect(createdId).toMatch(/^req_/);
    const args = createRollbackApprovalRequestStoreFn.mock.calls[0][0];
    expect(args).toMatchObject({
      approvalRequestId: createdId,
      requesterUserId: USER,
      secretId: SECRET,
      toVersionNumber: 3,
      promoteRequested: true,
      draftVersion: { secretId: SECRET, secretVersionId: NEW_SECRET_VERSION },
    });
  });

  it("hashes the comment into metadata rather than persisting the raw text", async () => {
    await createRollbackApprovalRequest({ ...baseInput, comment: "rollback please" });

    const args = createRollbackApprovalRequestStoreFn.mock.calls[0][0];
    expect(args.commentLength).toBe("rollback please".length);
    expect(JSON.stringify(args)).not.toContain("rollback please");
  });

  it("omits operationId when not supplied and forwards it when present", async () => {
    await createRollbackApprovalRequest(baseInput);
    expect(createRollbackApprovalRequestStoreFn.mock.calls[0][0]).not.toHaveProperty("operationId");

    await createRollbackApprovalRequest({ ...baseInput, operationId: OP });
    expect(createRollbackApprovalRequestStoreFn.mock.calls[1][0]).toMatchObject({
      operationId: OP,
    });
  });

  it("records the creation audit event for the generated id", async () => {
    const createdId = await createRollbackApprovalRequest(baseInput);

    expect(finalizeCreatedApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({ approvalRequestId: createdId, requestId: REQ }),
    );
  });
});
