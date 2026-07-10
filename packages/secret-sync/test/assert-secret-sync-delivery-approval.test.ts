import { PROTECTED_CHANGE_ERROR_CODES, requestId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceMocks = vi.hoisted(() => ({
  enforceProtectedDeliveryApproval: vi.fn(),
}));
const envMocks = vi.hoisted(() => ({
  getById: vi.fn(),
}));

vi.mock("@insecur/protected-change", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/protected-change")>();
  return {
    ...actual,
    enforceProtectedDeliveryApproval: enforceMocks.enforceProtectedDeliveryApproval,
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

import { assertSecretSyncDeliveryApproval } from "../src/assert-secret-sync-delivery-approval.js";
import type { SecretSyncRow } from "@insecur/tenant-store";

const PROTECTED_CHANGE_ID = requestId.brand("req_00000000000000000000000001");
const REQUEST_ID = requestId.brand("req_00000000000000000000000002");

const SYNC = {
  id: "sync_0000000000000000000000001",
  organizationId: "org_00000000000000000000000001",
  projectId: "prj_00000000000000000000000001",
  environmentId: "env_00000000000000000000000001",
} as unknown as SecretSyncRow;

function gateInput(overrides: Record<string, unknown> = {}) {
  return {
    action: "secret_sync_run" as const,
    sync: SYNC,
    actor: { type: "user" as const, userId: "usr_00000000000000000000000001" as never },
    auditActor: { type: "user" as const, userId: "usr_00000000000000000000000001" as never },
    requestId: REQUEST_ID,
    protectedChangeId: PROTECTED_CHANGE_ID,
    approvedDeliveryTargetFingerprint: "sha256:deadbeef",
    ...overrides,
  };
}

describe("assertSecretSyncDeliveryApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceMocks.enforceProtectedDeliveryApproval.mockResolvedValue({ status: "authorized" });
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

  it("does not gate a non-protected development sync (First Value loop stays open)", async () => {
    envMocks.getById.mockResolvedValue({ isProtected: false });

    await assertSecretSyncDeliveryApproval(gateInput());

    expect(enforceMocks.enforceProtectedDeliveryApproval).not.toHaveBeenCalled();
  });
});
