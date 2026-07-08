import {
  approvalRequestId,
  environmentId,
  machineIdentityId,
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

vi.mock("../src/assert-protected-change-access.js", () => ({
  assertProtectedChangeCreateAccess: vi.fn().mockResolvedValue(undefined),
}));

import { assertProtectedChangeCreateAccess } from "../src/assert-protected-change-access.js";
import { createPromotionApprovalRequest as createPromotion } from "../src/create-promotion-approval-request.js";
import { finalizeCreatedApprovalRequest } from "../src/record-created-approval-request-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const MACHINE = machineIdentityId.brand("mach_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const SECRET_VERSION = secretVersionId.brand("sv_00000000000000000000000001");

async function expectedSha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const baseInput = {
  actor: { type: "user", userId: USER } as const,
  auditActor: { type: "user", userId: USER } as const,
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
    vi.mocked(assertProtectedChangeCreateAccess).mockClear().mockResolvedValue(undefined);
  });

  it("authorizes the create scope for the target project + environment before persisting", async () => {
    await createPromotion(baseInput);

    expect(assertProtectedChangeCreateAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: baseInput.actor,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        requestId: REQ,
      }),
    );
    // Authz runs before any persistence.
    const authzOrder = vi.mocked(assertProtectedChangeCreateAccess).mock.invocationCallOrder[0];
    const createOrder = createPromotionApprovalRequest.mock.invocationCallOrder[0];
    expect(authzOrder).toBeLessThan(createOrder);
  });

  it("does not persist when authorization is denied", async () => {
    vi.mocked(assertProtectedChangeCreateAccess).mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "auth.insufficient_scope" }),
    );

    await expect(createPromotion(baseInput)).rejects.toThrow("denied");
    expect(supersedePendingPromotionRequests).not.toHaveBeenCalled();
    expect(createPromotionApprovalRequest).not.toHaveBeenCalled();
  });

  it("supersedes pending requests then creates the new one with the same generated id", async () => {
    const { approvalRequestId: newId } = await createPromotion(baseInput);

    expect(newId).toMatch(/^apr_/);
    const supersedeArgs = supersedePendingPromotionRequests.mock.calls[0][0];
    expect(supersedeArgs).toMatchObject({
      organizationId: ORG,
      environmentId: ENV,
      supersededByRequestId: newId,
    });

    const createArgs = createPromotionApprovalRequest.mock.calls[0][0];
    expect(createArgs).toMatchObject({
      approvalRequestId: newId,
      requester: { userId: USER },
      draftVersions: baseInput.validatedTargets,
      impactReviewFingerprint: "impact-fingerprint-v1",
    });
  });

  it("binds a machine requester when an Agent creates the request", async () => {
    await createPromotion({
      ...baseInput,
      actor: { type: "machine", machineIdentityId: MACHINE, tokenScope: {}, credentialScopes: [] },
      auditActor: { type: "machine", machineIdentityId: MACHINE },
    } as never);

    expect(createPromotionApprovalRequest.mock.calls[0][0].requester).toEqual({
      machineIdentityId: MACHINE,
    });
  });

  it("returns the superseded request ids from the store", async () => {
    const supersededId = approvalRequestId.brand("apr_00000000000000000000000042");
    supersedePendingPromotionRequests.mockResolvedValue([supersededId]);

    const result = await createPromotion(baseInput);

    expect(result.supersededApprovalRequestIds).toEqual([supersededId]);
  });

  it("stores a real SHA-256 digest of the comment, never the raw text", async () => {
    await createPromotion({ ...baseInput, comment: "please approve" });

    const createArgs = createPromotionApprovalRequest.mock.calls[0][0];
    expect(createArgs.commentLength).toBe(new TextEncoder().encode("please approve").byteLength);
    expect(createArgs.commentSha256).toBe(`sha256:${await expectedSha256Hex("please approve")}`);
    expect(createArgs.commentSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
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
