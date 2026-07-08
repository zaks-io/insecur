import {
  APPROVAL_ERROR_CODES,
  AUTH_ERROR_CODES,
  approvalRequestId,
  environmentId,
  organizationId,
  projectId,
  requestId,
  userId,
} from "@insecur/domain";
import { AUTHORIZATION_SCOPES } from "@insecur/access";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@insecur/access", () => ({
  AUTHORIZATION_SCOPES: {
    approvalApprove: "approval:approve",
    approvalReject: "approval:reject",
    membershipManage: "membership:manage",
  },
  hasAuthorizationScope: vi.fn((access: { scopes: string[] }, scope: string) =>
    access.scopes.includes(scope),
  ),
  resolveEffectiveAccess: vi.fn(),
  resolveEffectiveAccessBatch: vi.fn(),
}));

vi.mock("@insecur/tenant-store", () => ({
  TenantApprovalRequestStore: vi.fn(),
  TenantSecretVersionStore: vi.fn(),
  withTenantScope: vi.fn(),
}));

vi.mock("@insecur/audit", () => ({
  recordApprovalAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@insecur/auth", () => ({
  evaluateHighAssuranceChallengeClearAssurance: vi.fn(),
}));

vi.mock("../src/load-approval-impact-review-state.js", () => ({
  loadApprovalImpactReviewState: vi.fn(),
}));

vi.mock("../src/compute-impact-review-fingerprint.js", () => ({
  computeImpactReviewFingerprint: vi.fn(),
}));

import { evaluateHighAssuranceChallengeClearAssurance } from "@insecur/auth";
import { recordApprovalAudit } from "@insecur/audit";
import { resolveEffectiveAccess, resolveEffectiveAccessBatch } from "@insecur/access";
import {
  TenantApprovalRequestStore,
  TenantSecretVersionStore,
  withTenantScope,
} from "@insecur/tenant-store";
import { approveApprovalRequest } from "../src/approve-approval-request.js";
import { cancelApprovalRequest } from "../src/cancel-approval-request.js";
import { getApprovalRequestReview } from "../src/get-approval-request-review.js";
import { isImpactReviewStale } from "../src/approval-request-impact-review.js";
import { listPendingApprovalRequests } from "../src/list-pending-approval-requests.js";
import { rejectApprovalRequest } from "../src/reject-approval-request.js";
import { computeImpactReviewFingerprint } from "../src/compute-impact-review-fingerprint.js";
import { loadApprovalImpactReviewState } from "../src/load-approval-impact-review-state.js";
import { toApprovalRequestReviewListItem } from "../src/to-approval-request-review-item.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROJECT = projectId.brand("prj_00000000000000000000000001");
const ENV = environmentId.brand("env_00000000000000000000000001");
const USER = userId.brand("usr_00000000000000000000000001");
const REQUEST = approvalRequestId.brand("apr_00000000000000000000000001");
const REQ = requestId.brand("req_00000000000000000000000001");
const ACTOR = { type: "user" as const, userId: USER };
const AUDIT_ACTOR = { type: "user" as const, userId: USER } as const;
const NOW = new Date("2026-07-08T00:00:00.000Z");

const DETAIL_ROW = {
  approvalRequestId: REQUEST,
  purpose: "protected_promotion" as const,
  status: "pending" as const,
  projectId: PROJECT,
  environmentId: ENV,
  requesterUserId: USER,
  requesterMachineIdentityId: null,
  operationId: null,
  impactReviewFingerprint: "fp-old",
  commentLength: 12,
  createdAt: NOW,
  rollbackSecretId: null,
  rollbackToVersionId: null,
  rollbackPromoteRequested: false,
};

const IMPACT_STATE = {
  draftVersions: [],
  delivery: { runtimeInjectionPolicies: [], providerSyncImpact: [] },
};

function mockTenantScope() {
  vi.mocked(withTenantScope).mockImplementation(async (_scope, callback) =>
    callback({ db: {} } as never),
  );
}

describe("toApprovalRequestReviewListItem", () => {
  it("maps detail rows to metadata-only list items", () => {
    expect(toApprovalRequestReviewListItem(DETAIL_ROW)).toEqual({
      approvalRequestId: REQUEST,
      purpose: "protected_promotion",
      status: "pending",
      projectId: PROJECT,
      environmentId: ENV,
      requestedAt: NOW.toISOString(),
      operationId: null,
      requestingUserId: USER,
      requestingMachineIdentityId: null,
    });
  });
});

describe("isImpactReviewStale", () => {
  it("reports stale when fingerprints differ", () => {
    expect(
      isImpactReviewStale({ submittedFingerprint: "fp-old", currentFingerprint: "fp-new" }),
    ).toBe(true);
  });

  it("reports fresh when fingerprints match", () => {
    expect(
      isImpactReviewStale({ submittedFingerprint: "fp-same", currentFingerprint: "fp-same" }),
    ).toBe(false);
  });
});

describe("listPendingApprovalRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantScope();
  });

  it("filters rows to callers with approval review scopes", async () => {
    const listOrgPendingApprovalRequests = vi.fn().mockResolvedValue([DETAIL_ROW]);
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return { listOrgPendingApprovalRequests } as never;
    });
    vi.mocked(resolveEffectiveAccessBatch).mockResolvedValue([
      { organizationId: ORG, scopes: [AUTHORIZATION_SCOPES.approvalReject] },
    ]);

    await expect(
      listPendingApprovalRequests({ actor: ACTOR, organizationId: ORG }),
    ).resolves.toEqual([
      expect.objectContaining({
        approvalRequestId: REQUEST,
        status: "pending",
      }),
    ]);
  });

  it("omits rows the caller cannot review", async () => {
    const listOrgPendingApprovalRequests = vi.fn().mockResolvedValue([DETAIL_ROW]);
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return { listOrgPendingApprovalRequests } as never;
    });
    vi.mocked(resolveEffectiveAccessBatch).mockResolvedValue([{ organizationId: ORG, scopes: [] }]);

    await expect(
      listPendingApprovalRequests({ actor: ACTOR, organizationId: ORG }),
    ).resolves.toEqual([]);
  });

  it("returns an empty list when no pending requests exist", async () => {
    const listOrgPendingApprovalRequests = vi.fn().mockResolvedValue([]);
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return { listOrgPendingApprovalRequests } as never;
    });

    await expect(
      listPendingApprovalRequests({ actor: ACTOR, organizationId: ORG }),
    ).resolves.toEqual([]);
    expect(resolveEffectiveAccessBatch).not.toHaveBeenCalled();
  });
});

describe("getApprovalRequestReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantScope();
    vi.mocked(loadApprovalImpactReviewState).mockResolvedValue(IMPACT_STATE);
    vi.mocked(computeImpactReviewFingerprint).mockReturnValue("fp-current");
  });

  it("masks unauthorized reads as not found", async () => {
    const getApprovalRequestById = vi.fn().mockResolvedValue(DETAIL_ROW);
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return {
        getApprovalRequestById,
        getDraftVersionsForRequest: vi.fn().mockResolvedValue([]),
      } as never;
    });
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({ organizationId: ORG, scopes: [] });

    await expect(
      getApprovalRequestReview({
        actor: ACTOR,
        organizationId: ORG,
        approvalRequestId: REQUEST,
      }),
    ).rejects.toMatchObject({ code: APPROVAL_ERROR_CODES.requestNotFound });
  });

  it("returns metadata-only impact evidence for authorized reviewers", async () => {
    const getApprovalRequestById = vi.fn().mockResolvedValue(DETAIL_ROW);
    const getDraftVersionsForRequest = vi.fn().mockResolvedValue([]);
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return { getApprovalRequestById, getDraftVersionsForRequest } as never;
    });
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      organizationId: ORG,
      scopes: [AUTHORIZATION_SCOPES.approvalApprove],
    });

    await expect(
      getApprovalRequestReview({
        actor: ACTOR,
        organizationId: ORG,
        approvalRequestId: REQUEST,
      }),
    ).resolves.toMatchObject({
      approvalRequestId: REQUEST,
      commentLength: 12,
      impactReview: {
        fingerprintAtCreation: "fp-old",
        currentFingerprint: "fp-current",
        isStale: true,
      },
    });
  });

  it("masks missing requests as not found", async () => {
    const getApprovalRequestById = vi.fn().mockResolvedValue(null);
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return { getApprovalRequestById } as never;
    });

    await expect(
      getApprovalRequestReview({
        actor: ACTOR,
        organizationId: ORG,
        approvalRequestId: REQUEST,
      }),
    ).rejects.toMatchObject({ code: APPROVAL_ERROR_CODES.requestNotFound });
  });
});

describe("rejectApprovalRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantScope();
  });

  it("rejects pending requests for authorized reviewers", async () => {
    const getApprovalRequestById = vi.fn().mockResolvedValue(DETAIL_ROW);
    const transitionPendingApprovalRequest = vi.fn().mockResolvedValue(true);
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return { getApprovalRequestById, transitionPendingApprovalRequest } as never;
    });
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      organizationId: ORG,
      scopes: [AUTHORIZATION_SCOPES.approvalReject],
    });

    await expect(
      rejectApprovalRequest({
        actor: ACTOR,
        auditActor: AUDIT_ACTOR,
        organizationId: ORG,
        approvalRequestId: REQUEST,
        requestId: REQ,
      }),
    ).resolves.toEqual({ approvalRequestId: REQUEST, status: "rejected" });

    expect(recordApprovalAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "request_rejected", outcome: "success" }),
    );
  });
});

describe("cancelApprovalRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantScope();
  });

  it("allows the requester to cancel a pending request", async () => {
    const getApprovalRequestById = vi.fn().mockResolvedValue(DETAIL_ROW);
    const transitionPendingApprovalRequest = vi.fn().mockResolvedValue(true);
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return { getApprovalRequestById, transitionPendingApprovalRequest } as never;
    });
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      organizationId: ORG,
      scopes: [AUTHORIZATION_SCOPES.approvalReject],
    });

    await expect(
      cancelApprovalRequest({
        actor: ACTOR,
        auditActor: AUDIT_ACTOR,
        organizationId: ORG,
        approvalRequestId: REQUEST,
        requestId: REQ,
      }),
    ).resolves.toEqual({ approvalRequestId: REQUEST, status: "canceled" });
  });

  it("denies cancellation by non-requesters without cleanup scope", async () => {
    const getApprovalRequestById = vi.fn().mockResolvedValue({
      ...DETAIL_ROW,
      requesterUserId: userId.brand("usr_00000000000000000000000002"),
    });
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return { getApprovalRequestById } as never;
    });
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      organizationId: ORG,
      scopes: [AUTHORIZATION_SCOPES.approvalReject],
    });

    await expect(
      cancelApprovalRequest({
        actor: ACTOR,
        auditActor: AUDIT_ACTOR,
        organizationId: ORG,
        approvalRequestId: REQUEST,
        requestId: REQ,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.insufficientScope });
  });
});

describe("approveApprovalRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenantScope();
    vi.mocked(loadApprovalImpactReviewState).mockResolvedValue(IMPACT_STATE);
    vi.mocked(computeImpactReviewFingerprint).mockReturnValue("fp-current");
  });

  it("requires fresh step-up evidence", async () => {
    vi.mocked(evaluateHighAssuranceChallengeClearAssurance).mockReturnValue({
      ok: false,
      reason: "stale",
    } as never);

    await expect(
      approveApprovalRequest({
        actor: ACTOR,
        auditActor: AUDIT_ACTOR,
        organizationId: ORG,
        approvalRequestId: REQUEST,
        sessionAssurance: {} as never,
        impactReviewFingerprint: "fp-current",
        requestId: REQ,
      }),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.highAssuranceRequired });
  });

  it("approves and publishes when evidence and fingerprints are fresh", async () => {
    const getApprovalRequestById = vi.fn().mockResolvedValue(DETAIL_ROW);
    const getDraftVersionsForRequest = vi.fn().mockResolvedValue([]);
    const transitionPendingApprovalRequest = vi.fn().mockResolvedValue(true);
    const publishVersions = vi.fn().mockResolvedValue(undefined);
    vi.mocked(TenantApprovalRequestStore).mockImplementation(function MockStore() {
      return {
        getApprovalRequestById,
        getDraftVersionsForRequest,
        transitionPendingApprovalRequest,
      } as never;
    });
    vi.mocked(TenantSecretVersionStore).mockImplementation(function MockStore() {
      return { publishVersions } as never;
    });
    vi.mocked(resolveEffectiveAccess).mockResolvedValue({
      organizationId: ORG,
      scopes: [AUTHORIZATION_SCOPES.approvalApprove],
    });
    vi.mocked(evaluateHighAssuranceChallengeClearAssurance).mockReturnValue({ ok: true } as never);

    await expect(
      approveApprovalRequest({
        actor: ACTOR,
        auditActor: AUDIT_ACTOR,
        organizationId: ORG,
        approvalRequestId: REQUEST,
        sessionAssurance: {} as never,
        impactReviewFingerprint: "fp-current",
        requestId: REQ,
      }),
    ).resolves.toEqual({ approvalRequestId: REQUEST, status: "approved_applied" });

    expect(publishVersions).toHaveBeenCalled();
    expect(recordApprovalAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "request_approved", outcome: "success" }),
    );
  });
});
