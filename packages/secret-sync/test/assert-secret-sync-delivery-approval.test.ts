import { PROTECTED_CHANGE_ERROR_CODES, requestId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceMocks = vi.hoisted(() => ({
  enforceProtectedDeliveryApproval: vi.fn(),
  recordProtectedDeliveryApprovalAudit: vi.fn(),
}));
const envMocks = vi.hoisted(() => ({
  getById: vi.fn(),
}));

vi.mock("@insecur/protected-change", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/protected-change")>();
  return {
    ...actual,
    enforceProtectedDeliveryApproval: enforceMocks.enforceProtectedDeliveryApproval,
    recordProtectedDeliveryApprovalAudit: enforceMocks.recordProtectedDeliveryApprovalAudit,
  };
});

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(
      async (_scope: unknown, callback: (handles: { db: unknown }) => unknown) =>
        callback({ db: {} }),
    ),
    TenantEnvironmentLifecycleStore: vi.fn(function MockStore() {
      return { getById: envMocks.getById };
    }),
  };
});

import {
  assertProtectedSecretSyncActionApproved,
  assertSecretSyncDeliveryApproval,
} from "../src/assert-secret-sync-delivery-approval.js";
import type { SecretSyncRow } from "@insecur/tenant-store";

const PROTECTED_CHANGE_ID = requestId.brand("req_00000000000000000000000001");
const REQUEST_ID = requestId.brand("req_00000000000000000000000002");

const SYNC = {
  id: "sync_0000000000000000000000001",
  organizationId: "org_00000000000000000000000001",
  projectId: "prj_00000000000000000000000001",
  environmentId: "env_00000000000000000000000001",
} as unknown as SecretSyncRow;

const ACTOR = { type: "user" as const, userId: "usr_00000000000000000000000001" as never };

function gateInput(overrides: Record<string, unknown> = {}) {
  return {
    action: "secret_sync_run" as const,
    sync: SYNC,
    actor: ACTOR,
    requestId: REQUEST_ID,
    protectedChangeId: PROTECTED_CHANGE_ID,
    ...overrides,
  };
}

describe("assertSecretSyncDeliveryApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceMocks.enforceProtectedDeliveryApproval.mockResolvedValue({ status: "authorized" });
    enforceMocks.recordProtectedDeliveryApprovalAudit.mockResolvedValue(undefined);
  });

  it("enforces approval evidence for a protected environment sync run", async () => {
    envMocks.getById.mockResolvedValue({ isProtected: true });

    await assertSecretSyncDeliveryApproval(gateInput());

    expect(enforceMocks.enforceProtectedDeliveryApproval).toHaveBeenCalledTimes(1);
    const arg = enforceMocks.enforceProtectedDeliveryApproval.mock.calls[0]?.[0];
    expect(arg.target).toMatchObject({
      organizationId: SYNC.organizationId,
      projectId: SYNC.projectId,
      environmentId: SYNC.environmentId,
      kind: "secret_sync_run",
      targetId: SYNC.id,
    });
    expect(arg.auditActor).toEqual({ type: "user", userId: ACTOR.userId });
  });

  it("propagates a fail-closed denial from the enforcement seam", async () => {
    envMocks.getById.mockResolvedValue({ isProtected: true });
    enforceMocks.enforceProtectedDeliveryApproval.mockRejectedValue(
      Object.assign(new Error("denied"), {
        code: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
      }),
    );

    await expect(assertSecretSyncDeliveryApproval(gateInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
    });
  });

  it("fails closed with missing_evidence and a denied audit when a protected execution names no protected change", async () => {
    envMocks.getById.mockResolvedValue({ isProtected: true });

    await expect(
      assertSecretSyncDeliveryApproval(gateInput({ protectedChangeId: undefined })),
    ).rejects.toMatchObject({ code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence });

    expect(enforceMocks.enforceProtectedDeliveryApproval).not.toHaveBeenCalled();
    expect(enforceMocks.recordProtectedDeliveryApprovalAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "denied",
        reasonCode: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
        target: expect.objectContaining({ kind: "secret_sync_run", targetId: SYNC.id }),
      }),
    );
  });

  it("still fails closed when the denied audit write itself fails", async () => {
    envMocks.getById.mockResolvedValue({ isProtected: true });
    enforceMocks.recordProtectedDeliveryApprovalAudit.mockRejectedValue(
      new Error("audit unavailable"),
    );

    await expect(
      assertSecretSyncDeliveryApproval(gateInput({ protectedChangeId: undefined })),
    ).rejects.toMatchObject({ code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence });
  });

  it("does not gate a non-protected development sync (First Value loop stays open)", async () => {
    envMocks.getById.mockResolvedValue({ isProtected: false });

    await assertSecretSyncDeliveryApproval(gateInput());

    expect(enforceMocks.enforceProtectedDeliveryApproval).not.toHaveBeenCalled();
  });
});

describe("assertProtectedSecretSyncActionApproved", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceMocks.enforceProtectedDeliveryApproval.mockResolvedValue({ status: "authorized" });
  });

  it("builds the delivery coordinate from the command scope and exact sync id", async () => {
    envMocks.getById.mockResolvedValue({ isProtected: true });

    await assertProtectedSecretSyncActionApproved(
      "secret_sync_enable",
      {
        actor: ACTOR,
        organizationId: SYNC.organizationId,
        projectId: SYNC.projectId,
        environmentId: SYNC.environmentId,
        requestId: REQUEST_ID,
        protectedChangeId: PROTECTED_CHANGE_ID,
      },
      SYNC.id,
    );

    expect(enforceMocks.enforceProtectedDeliveryApproval).toHaveBeenCalledTimes(1);
    const arg = enforceMocks.enforceProtectedDeliveryApproval.mock.calls[0]?.[0];
    expect(arg.target).toMatchObject({
      organizationId: SYNC.organizationId,
      projectId: SYNC.projectId,
      environmentId: SYNC.environmentId,
      kind: "secret_sync_enable",
      targetId: SYNC.id,
    });
    expect(arg.protectedChangeId).toBe(PROTECTED_CHANGE_ID);
  });
});
