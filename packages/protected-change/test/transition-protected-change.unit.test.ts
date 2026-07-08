import { AUTH_ERROR_CODES, PROTECTED_CHANGE_ERROR_CODES, requestId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  authorizeScopeOrThrow: vi.fn(),
}));
const storeMocks = vi.hoisted(() => ({
  getById: vi.fn(),
  applyTransition: vi.fn(),
  insertApprovalEvidence: vi.fn(),
}));
const auditMocks = vi.hoisted(() => ({
  recordProtectedChangeAudit: vi.fn(),
}));

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return {
    ...actual,
    authorizeScopeOrThrow: accessMocks.authorizeScopeOrThrow,
  };
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(
      async (_scope: unknown, callback: (handles: { sql: unknown }) => unknown) =>
        callback({ sql: {} }),
    ),
  };
});

vi.mock("../src/tenant-protected-change-store.js", () => ({
  TenantProtectedChangeStore: vi.fn(function MockStore() {
    return {
      getById: storeMocks.getById,
      applyTransition: storeMocks.applyTransition,
      insertApprovalEvidence: storeMocks.insertApprovalEvidence,
    };
  }),
}));

vi.mock("../src/record-protected-change-audit.js", () => ({
  recordProtectedChangeAudit: auditMocks.recordProtectedChangeAudit,
}));

import { ProtectedChangeError } from "../src/protected-change-errors.js";
import type { ProtectedChangeRecord } from "../src/protected-change-types.js";
import {
  approveProtectedChange,
  cancelProtectedChange,
  submitProtectedChangeForApproval,
} from "../src/transition-protected-change-api.js";

const ORG = "org_00000000000000000000000001" as ProtectedChangeRecord["organizationId"];
const PROJECT = "prj_00000000000000000000000001" as ProtectedChangeRecord["projectId"];
const ENV = "env_00000000000000000000000001" as ProtectedChangeRecord["environmentId"];
const PROTECTED_CHANGE_ID = requestId.brand("req_00000000000000000000000001");
const USER = "usr_00000000000000000000000001";

const PENDING_RECORD: ProtectedChangeRecord = {
  protectedChangeId: PROTECTED_CHANGE_ID,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  state: "pending_approval",
  purpose: "promotion",
  requesterUserId: USER as ProtectedChangeRecord["requesterUserId"],
  requesterMachineIdentityId: null,
  draftVersionIds: [],
  impactReviewFingerprint: null,
  executionOperationId: null,
  closureReasonCode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ACTOR = { type: "user" as const, userId: USER as never };
const AUDIT_ACTOR = { type: "user" as const, userId: USER as never };

function transitionInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    protectedChangeId: PROTECTED_CHANGE_ID,
    actor: ACTOR,
    auditActor: AUDIT_ACTOR,
    requestId: requestId.brand("req_00000000000000000000000002"),
    ...overrides,
  };
}

describe("transitionProtectedChange via public API wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMocks.authorizeScopeOrThrow.mockResolvedValue(undefined);
    storeMocks.getById.mockResolvedValue(PENDING_RECORD);
    storeMocks.insertApprovalEvidence.mockResolvedValue(undefined);
    auditMocks.recordProtectedChangeAudit.mockResolvedValue(undefined);
  });

  it("submits a pending-approval transition and records a success audit", async () => {
    const proposed = { ...PENDING_RECORD, state: "proposed" as const };
    storeMocks.getById.mockResolvedValue(proposed);
    storeMocks.applyTransition.mockResolvedValue(PENDING_RECORD);

    const result = await submitProtectedChangeForApproval(transitionInput());

    expect(result).toBe(PENDING_RECORD);
    expect(storeMocks.applyTransition).toHaveBeenCalledTimes(1);
    expect(storeMocks.applyTransition.mock.calls[0]?.[0]).toMatchObject({
      nextState: "pending_approval",
    });
    const auditArg = auditMocks.recordProtectedChangeAudit.mock.calls.at(-1)?.[0];
    expect(auditArg).toMatchObject({
      action: "submitted",
      outcome: "success",
      fromState: "proposed",
      toState: "pending_approval",
    });
  });

  it("writes approval evidence only on an approved transition", async () => {
    const approved = { ...PENDING_RECORD, state: "approved" as const };
    storeMocks.applyTransition.mockResolvedValue(approved);

    await approveProtectedChange(
      transitionInput({
        impactReviewFingerprint: "impact-fingerprint-v1",
        approvalEvidence: {
          evidenceId: "aud_00000000000000000000000001" as never,
          approverUserId: USER as never,
          auditEventId: "aud_00000000000000000000000002" as never,
          impactReviewFingerprint: "impact-fingerprint-v1",
        },
      }),
    );

    expect(storeMocks.insertApprovalEvidence).toHaveBeenCalledTimes(1);
    expect(storeMocks.insertApprovalEvidence.mock.calls[0]?.[0]).toMatchObject({
      organizationId: ORG,
      protectedChangeId: PROTECTED_CHANGE_ID,
      approverUserId: USER,
    });
  });

  it("rejects an approval that is missing its impact-review fingerprint before touching the store", async () => {
    await expect(
      approveProtectedChange(
        transitionInput({
          approvalEvidence: {
            evidenceId: "aud_00000000000000000000000001" as never,
            approverUserId: USER as never,
            auditEventId: "aud_00000000000000000000000002" as never,
            impactReviewFingerprint: "impact-fingerprint-v1",
          },
        }),
      ),
    ).rejects.toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence }),
    );
    expect(storeMocks.applyTransition).not.toHaveBeenCalled();
  });

  it("records a denial audit and rethrows when the actor lacks scope", async () => {
    accessMocks.authorizeScopeOrThrow.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: AUTH_ERROR_CODES.insufficientScope }),
    );

    await expect(submitProtectedChangeForApproval(transitionInput())).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    expect(storeMocks.applyTransition).not.toHaveBeenCalled();
    const auditArg = auditMocks.recordProtectedChangeAudit.mock.calls.at(-1)?.[0];
    expect(auditArg).toMatchObject({
      action: "submitted",
      outcome: "denied",
    });
  });

  it("records a transition_denied audit and rethrows when the store rejects an invalid transition", async () => {
    storeMocks.applyTransition.mockRejectedValueOnce(
      new ProtectedChangeError(
        PROTECTED_CHANGE_ERROR_CODES.invalidTransition,
        "invalid transition",
      ),
    );

    await expect(submitProtectedChangeForApproval(transitionInput())).rejects.toBeInstanceOf(
      ProtectedChangeError,
    );
    const auditArg = auditMocks.recordProtectedChangeAudit.mock.calls.at(-1)?.[0];
    expect(auditArg).toMatchObject({
      action: "submitted",
      outcome: "denied",
      reasonCode: PROTECTED_CHANGE_ERROR_CODES.invalidTransition,
      fromState: "pending_approval",
      toState: "pending_approval",
    });
  });

  it("rejects a transition against a protected change that no longer exists", async () => {
    storeMocks.getById.mockResolvedValueOnce(null);

    await expect(cancelProtectedChange(transitionInput())).rejects.toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.notFound }),
    );
    expect(storeMocks.applyTransition).not.toHaveBeenCalled();
  });
});
