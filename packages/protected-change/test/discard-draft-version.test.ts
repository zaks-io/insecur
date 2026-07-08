import {
  approvalRequestId,
  environmentId,
  organizationId,
  projectId,
  requestId,
  secretId,
  secretVersionId,
  userId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/tenant-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/tenant-store")>();
  return {
    ...actual,
    withTenantScope: vi.fn(),
    TenantSecretVersionStore: vi.fn(),
    TenantApprovalRequestStore: vi.fn(),
  };
});

vi.mock("@insecur/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/audit")>();
  return {
    ...actual,
    recordStorageAudit: vi.fn().mockResolvedValue(undefined),
    recordApprovalAudit: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../src/assert-secret-protected-mutation-access.js", () => ({
  assertSecretProtectedMutationAccess: vi.fn(),
}));

import { recordApprovalAudit, recordStorageAudit } from "@insecur/audit";
import {
  SecretVersionStoreConflictError,
  SecretVersionStoreNotFoundError,
  TenantApprovalRequestStore,
  TenantSecretVersionStore,
  withTenantScope,
} from "@insecur/tenant-store";

import { assertSecretProtectedMutationAccess } from "../src/assert-secret-protected-mutation-access.js";
import { discardDraftVersion } from "../src/discard-draft-version.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const SECRET = secretId.brand("sec_00000000000000000000000001");
const DRAFT = secretVersionId.brand("sv_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const APPROVAL = approvalRequestId.brand("apr_00000000000000000000000002");

const ACTOR = { type: "user" as const, userId: USER };

function mockDiscardStore(discardDraftVersionMock: ReturnType<typeof vi.fn>) {
  vi.mocked(TenantSecretVersionStore).mockImplementation(function MockStore() {
    return { discardDraftVersion: discardDraftVersionMock } as never;
  } as never);
}

function mockApprovalStore(closeMock: ReturnType<typeof vi.fn>) {
  vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
    return {
      closePendingApprovalRequestsForDiscardedDraftVersion: closeMock,
    } as never;
  } as never);
}

describe("discardDraftVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(withTenantScope).mockImplementation(async (_scope, callback) =>
      callback({ db: {} as never }),
    );
    vi.mocked(assertSecretProtectedMutationAccess).mockResolvedValue(undefined);
  });

  it("discards the draft and closes pending approvals referencing it", async () => {
    const discardMock = vi
      .fn()
      .mockResolvedValue({ secretId: SECRET, secretVersionId: DRAFT, alreadyDiscarded: false });
    const closeMock = vi.fn().mockResolvedValue([APPROVAL]);
    mockDiscardStore(discardMock);
    mockApprovalStore(closeMock);

    const result = await discardDraftVersion({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretId: SECRET,
      secretVersionId: DRAFT,
      requestId: REQ,
    });

    expect(result).toEqual({
      secretId: SECRET,
      secretVersionId: DRAFT,
      alreadyDiscarded: false,
      closedApprovalRequestCount: 1,
    });
    expect(closeMock).toHaveBeenCalledWith({ organizationId: ORG, secretVersionId: DRAFT });
    expect(recordApprovalAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "request_draft_discard_closed",
        outcome: "success",
      }),
    );
    expect(recordStorageAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "success", secretVersionId: DRAFT }),
    );
  });

  it("does not close approvals or double-record success audit for an already-discarded version", async () => {
    const discardMock = vi
      .fn()
      .mockResolvedValue({ secretId: SECRET, secretVersionId: DRAFT, alreadyDiscarded: true });
    const closeMock = vi.fn();
    mockDiscardStore(discardMock);
    mockApprovalStore(closeMock);

    const result = await discardDraftVersion({
      actor: ACTOR,
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      secretId: SECRET,
      secretVersionId: DRAFT,
      requestId: REQ,
    });

    expect(result).toMatchObject({ alreadyDiscarded: true, closedApprovalRequestCount: 0 });
    expect(closeMock).not.toHaveBeenCalled();
    expect(recordApprovalAudit).not.toHaveBeenCalled();
  });

  it("fails closed when the caller lacks the secretProtectedDraftWrite scope, recording a denial", async () => {
    vi.mocked(assertSecretProtectedMutationAccess).mockRejectedValue(
      Object.assign(new Error("scope required"), { code: "auth.insufficient_scope" }),
    );

    await expect(
      discardDraftVersion({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretId: SECRET,
        secretVersionId: DRAFT,
        requestId: REQ,
      }),
    ).rejects.toThrow("scope required");

    expect(recordStorageAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "denied", secretVersionId: DRAFT }),
    );
    expect(withTenantScope).not.toHaveBeenCalled();
  });

  it("translates a not-found draft into a draftVersionNotDiscardable error", async () => {
    const discardMock = vi.fn().mockRejectedValue(new SecretVersionStoreNotFoundError("nope"));
    mockDiscardStore(discardMock);
    mockApprovalStore(vi.fn());

    await expect(
      discardDraftVersion({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretId: SECRET,
        secretVersionId: DRAFT,
        requestId: REQ,
      }),
    ).rejects.toMatchObject({ code: "approval.draft_version_not_discardable" });
  });

  it("translates a non-draft-state conflict into a draftVersionNotDiscardable error", async () => {
    const discardMock = vi.fn().mockRejectedValue(new SecretVersionStoreConflictError("nope"));
    mockDiscardStore(discardMock);
    mockApprovalStore(vi.fn());

    await expect(
      discardDraftVersion({
        actor: ACTOR,
        organizationId: ORG,
        projectId: PROJECT,
        environmentId: ENV,
        secretId: SECRET,
        secretVersionId: DRAFT,
        requestId: REQ,
      }),
    ).rejects.toMatchObject({ code: "approval.draft_version_not_discardable" });
  });
});
