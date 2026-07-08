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
const accessMocks = vi.hoisted(() => ({ authorizeScopeOrThrow: vi.fn() }));

// Real access package except the EAR leaf (`authorizeScopeOrThrow`), which would hit the database.
// This keeps the real coordinate assertion, denial classifier, and audit-on-denial wiring under test.
vi.mock("@insecur/access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@insecur/access")>()),
  authorizeScopeOrThrow: accessMocks.authorizeScopeOrThrow,
}));

vi.mock("@insecur/tenant-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@insecur/tenant-store")>()),
  withTenantScope: vi.fn((_scope: unknown, run: (ctx: { db: unknown }) => unknown) =>
    run({ db: {} }),
  ),
  TenantApprovalRequestStore: vi.fn(function TenantApprovalRequestStore() {
    return { createRollbackApprovalRequest: createRollbackApprovalRequestStoreFn };
  }),
}));

vi.mock("../src/record-created-approval-request-audit.js", () => ({
  finalizeCreatedApprovalRequest: vi.fn().mockResolvedValue(undefined),
  recordDeniedApprovalRequestCreate: vi.fn().mockResolvedValue(undefined),
}));

import { createRollbackApprovalRequest } from "../src/create-rollback-approval-request.js";
import {
  finalizeCreatedApprovalRequest,
  recordDeniedApprovalRequestCreate,
} from "../src/record-created-approval-request-audit.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const OP = operationId.brand("op_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const NEW_SECRET_VERSION = secretVersionId.brand("sv_00000000000000000000000001");
const TO_VERSION = secretVersionId.brand("sv_00000000000000000000000002");

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
  isProtectedEnvironment: true,
  secretId: SECRET,
  toVersionId: TO_VERSION,
  newSecretVersionId: NEW_SECRET_VERSION,
  impactReviewFingerprint: "impact-fingerprint-v1",
  requestId: REQ,
};

describe("createRollbackApprovalRequest", () => {
  beforeEach(() => {
    createRollbackApprovalRequestStoreFn.mockReset().mockResolvedValue(undefined);
    vi.mocked(finalizeCreatedApprovalRequest).mockClear();
    vi.mocked(recordDeniedApprovalRequestCreate).mockClear();
    accessMocks.authorizeScopeOrThrow.mockReset().mockResolvedValue(undefined);
  });

  it("fails closed for a non-protected environment and persists nothing", async () => {
    await expect(
      createRollbackApprovalRequest({ ...baseInput, isProtectedEnvironment: false }),
    ).rejects.toMatchObject({ code: "protected_change.non_protected_environment" });

    expect(accessMocks.authorizeScopeOrThrow).not.toHaveBeenCalled();
    expect(createRollbackApprovalRequestStoreFn).not.toHaveBeenCalled();
  });

  it("authorizes the create scope before persisting", async () => {
    await createRollbackApprovalRequest(baseInput);

    expect(accessMocks.authorizeScopeOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: baseInput.actor,
        coordinate: { organizationId: ORG, projectId: PROJECT, environmentId: ENV },
        requestId: REQ,
      }),
    );
  });

  it("records a denied audit and persists nothing when authorization is denied", async () => {
    accessMocks.authorizeScopeOrThrow.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: "auth.insufficient_scope" }),
    );

    await expect(createRollbackApprovalRequest(baseInput)).rejects.toThrow("denied");

    expect(recordDeniedApprovalRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        auditActor: baseInput.auditActor,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        requestId: REQ,
      }),
    );
    expect(finalizeCreatedApprovalRequest).not.toHaveBeenCalled();
    expect(createRollbackApprovalRequestStoreFn).not.toHaveBeenCalled();
  });

  it("creates a promote-requested rollback request with a single draft version for the target secret", async () => {
    const createdId = await createRollbackApprovalRequest(baseInput);

    expect(createdId).toMatch(/^apr_/);
    const args = createRollbackApprovalRequestStoreFn.mock.calls[0][0];
    expect(args).toMatchObject({
      approvalRequestId: createdId,
      requester: { userId: USER },
      secretId: SECRET,
      toVersionId: TO_VERSION,
      promoteRequested: true,
      draftVersion: { secretId: SECRET, secretVersionId: NEW_SECRET_VERSION },
    });
  });

  it("stores a real SHA-256 digest of the comment, never the raw text", async () => {
    await createRollbackApprovalRequest({ ...baseInput, comment: "rollback please" });

    const args = createRollbackApprovalRequestStoreFn.mock.calls[0][0];
    expect(args.commentLength).toBe(new TextEncoder().encode("rollback please").byteLength);
    expect(args.commentSha256).toBe(`sha256:${await expectedSha256Hex("rollback please")}`);
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
