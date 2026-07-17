import { AUTH_ERROR_CODES, PROTECTED_CHANGE_ERROR_CODES, requestId } from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  authorizeScopeOrThrow: vi.fn(),
}));
const storeMocks = vi.hoisted(() => ({
  insertProtectedChange: vi.fn(),
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
    return { insertProtectedChange: storeMocks.insertProtectedChange };
  }),
}));

vi.mock("../src/record-protected-change-audit.js", () => ({
  recordProtectedChangeAudit: auditMocks.recordProtectedChangeAudit,
}));

import { createProtectedChange } from "../src/create-protected-change.js";
import type { CreateProtectedChangeRequestInput } from "../src/create-protected-change.js";
import type { ProtectedChangeRecord } from "../src/protected-change-types.js";

const ORG = "org_00000000000000000000000001" as ProtectedChangeRecord["organizationId"];
const PROJECT = "prj_00000000000000000000000001" as ProtectedChangeRecord["projectId"];
const ENV = "env_00000000000000000000000001" as ProtectedChangeRecord["environmentId"];
const PROTECTED_CHANGE_ID = requestId.brand("req_00000000000000000000000001");
const USER = "usr_00000000000000000000000001" as ProtectedChangeRecord["requesterUserId"] & string;
const DRAFT_VERSION_ID = "sv_00000000000000000000000099" as never;

const RECORD: ProtectedChangeRecord = {
  protectedChangeId: PROTECTED_CHANGE_ID,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  state: "proposed",
  purpose: "promotion",
  requesterUserId: USER as ProtectedChangeRecord["requesterUserId"],
  requesterMachineIdentityId: null,
  draftVersionIds: [DRAFT_VERSION_ID],
  deliveryTarget: null,
  impactReviewFingerprint: null,
  executionOperationId: null,
  closureReasonCode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function input(
  overrides: Partial<CreateProtectedChangeRequestInput> = {},
): CreateProtectedChangeRequestInput {
  return {
    organizationId: ORG,
    projectId: PROJECT,
    environmentId: ENV,
    protectedChangeId: PROTECTED_CHANGE_ID,
    requester: { userId: USER as never },
    draftVersionIds: [DRAFT_VERSION_ID],
    actor: { type: "user", userId: USER as never },
    auditActor: { type: "user", userId: USER as never },
    requestId: requestId.brand("req_00000000000000000000000002"),
    isProtectedEnvironment: true,
    ...overrides,
  };
}

describe("createProtectedChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMocks.authorizeScopeOrThrow.mockResolvedValue(undefined);
    storeMocks.insertProtectedChange.mockResolvedValue(RECORD);
    auditMocks.recordProtectedChangeAudit.mockResolvedValue(undefined);
  });

  it("fails closed before any access check for a non-protected environment", async () => {
    await expect(
      createProtectedChange(input({ isProtectedEnvironment: false })),
    ).rejects.toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.nonProtectedEnvironment }),
    );
    expect(accessMocks.authorizeScopeOrThrow).not.toHaveBeenCalled();
    expect(storeMocks.insertProtectedChange).not.toHaveBeenCalled();
  });

  it("persists the proposed record and records a success audit on the happy path", async () => {
    const record = await createProtectedChange(input());

    expect(record).toBe(RECORD);
    expect(storeMocks.insertProtectedChange).toHaveBeenCalledTimes(1);
    expect(auditMocks.recordProtectedChangeAudit).toHaveBeenCalledTimes(1);
    const auditArg = auditMocks.recordProtectedChangeAudit.mock.calls[0]?.[0];
    expect(auditArg).toMatchObject({
      action: "request_created",
      outcome: "success",
      toState: "proposed",
      protectedChangeId: RECORD.protectedChangeId,
    });
  });

  it("records a denial audit and rethrows when access is denied, without inserting", async () => {
    accessMocks.authorizeScopeOrThrow.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: AUTH_ERROR_CODES.insufficientScope }),
    );

    await expect(createProtectedChange(input())).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    expect(storeMocks.insertProtectedChange).not.toHaveBeenCalled();
    expect(auditMocks.recordProtectedChangeAudit).toHaveBeenCalledTimes(1);
    expect(auditMocks.recordProtectedChangeAudit.mock.calls[0]?.[0]).toMatchObject({
      action: "request_created",
      outcome: "denied",
    });
  });

  it("does not record a denial audit for a non-access error from the authorizer", async () => {
    accessMocks.authorizeScopeOrThrow.mockRejectedValueOnce(new Error("boom"));

    await expect(createProtectedChange(input())).rejects.toThrow("boom");
    expect(auditMocks.recordProtectedChangeAudit).not.toHaveBeenCalled();
    expect(storeMocks.insertProtectedChange).not.toHaveBeenCalled();
  });
});
