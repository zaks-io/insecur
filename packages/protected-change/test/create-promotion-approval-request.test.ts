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

const supersedePendingPromotionRequests = vi.fn();
const createPromotionApprovalRequest = vi.fn();

vi.mock("@insecur/tenant-store", () => ({
  withTenantScope: vi.fn((_scope: unknown, run: (ctx: { db: unknown }) => unknown) =>
    run({ db: {} }),
  ),
  TenantApprovalRequestStore: vi.fn(function TenantApprovalRequestStore() {
    return { supersedePendingPromotionRequests, createPromotionApprovalRequest };
  }),
}));

vi.mock("../src/record-created-approval-request-audit.js", () => ({
  finalizeCreatedApprovalRequest: vi.fn().mockResolvedValue(undefined),
}));

import { createPromotionApprovalRequest as createPromotion } from "../src/create-promotion-approval-request.js";
import { finalizeCreatedApprovalRequest } from "../src/record-created-approval-request-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const SECRET_VERSION = secretVersionId.brand("sv_00000000000000000000000001");

const baseInput = {
  actor: { type: "user", userId: USER } as const,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  validatedTargets: [{ secretId: SECRET, secretVersionId: SECRET_VERSION }],
  impactReviewFingerprint: "impact-fingerprint-v1",
  requestId: REQ,
};

describe("createPromotionApprovalRequest", () => {
  beforeEach(() => {
    supersedePendingPromotionRequests.mockReset().mockResolvedValue([]);
    createPromotionApprovalRequest.mockReset().mockResolvedValue(undefined);
    vi.mocked(finalizeCreatedApprovalRequest).mockClear();
  });

  it("supersedes pending requests then creates the new one with the same generated id", async () => {
    const { approvalRequestId: newId } = await createPromotion(baseInput);

    const supersedeArgs = supersedePendingPromotionRequests.mock.calls[0][0];
    expect(supersedeArgs).toMatchObject({
      organizationId: ORG,
      environmentId: ENV,
      supersededByRequestId: newId,
    });

    const createArgs = createPromotionApprovalRequest.mock.calls[0][0];
    expect(createArgs).toMatchObject({
      approvalRequestId: newId,
      requesterUserId: USER,
      draftVersions: baseInput.validatedTargets,
      impactReviewFingerprint: "impact-fingerprint-v1",
    });
  });

  it("returns the superseded request ids from the store", async () => {
    const supersededId = requestId.brand("req_00000000000000000000000042");
    supersedePendingPromotionRequests.mockResolvedValue([supersededId]);

    const result = await createPromotion(baseInput);

    expect(result.supersededApprovalRequestIds).toEqual([supersededId]);
  });

  it("hashes the comment into metadata rather than persisting the raw text", async () => {
    await createPromotion({ ...baseInput, comment: "please approve" });

    const createArgs = createPromotionApprovalRequest.mock.calls[0][0];
    expect(createArgs.commentLength).toBe("please approve".length);
    expect(createArgs.commentSha256).toBe(`sha256:${String("please approve".length)}`);
    expect(JSON.stringify(createArgs)).not.toContain("please approve");
  });

  it("omits operationId when not supplied and forwards it when present", async () => {
    await createPromotion(baseInput);
    expect(createPromotionApprovalRequest.mock.calls[0][0]).not.toHaveProperty("operationId");

    await createPromotion({ ...baseInput, operationId: OP });
    expect(createPromotionApprovalRequest.mock.calls[1][0]).toMatchObject({ operationId: OP });
  });

  it("records the creation audit event", async () => {
    const { approvalRequestId: newId } = await createPromotion(baseInput);

    expect(finalizeCreatedApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({ approvalRequestId: newId, requestId: REQ }),
    );
  });
});
