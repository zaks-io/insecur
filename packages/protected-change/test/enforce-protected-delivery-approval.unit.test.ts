import {
  APPROVAL_ERROR_CODES,
  AUTH_ERROR_CODES,
  PROTECTED_CHANGE_ERROR_CODES,
  requestId,
} from "@insecur/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accessMocks = vi.hoisted(() => ({
  authorizeScopeOrThrow: vi.fn(),
}));
const storeMocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getApprovalEvidence: vi.fn(),
  consumeApprovalEvidence: vi.fn(),
}));
const auditMocks = vi.hoisted(() => ({
  recordProtectedDeliveryApprovalAudit: vi.fn(),
}));
const recomputeMocks = vi.hoisted(() => ({
  recomputeProtectedChangeImpactFingerprint: vi.fn(),
}));

vi.mock("@insecur/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@insecur/access")>();
  return { ...actual, authorizeScopeOrThrow: accessMocks.authorizeScopeOrThrow };
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
      getApprovalEvidence: storeMocks.getApprovalEvidence,
      consumeApprovalEvidence: storeMocks.consumeApprovalEvidence,
    };
  }),
}));

vi.mock("../src/record-protected-delivery-approval-audit.js", () => ({
  recordProtectedDeliveryApprovalAudit: auditMocks.recordProtectedDeliveryApprovalAudit,
}));

vi.mock("../src/recompute-protected-change-impact-fingerprint.js", () => ({
  recomputeProtectedChangeImpactFingerprint:
    recomputeMocks.recomputeProtectedChangeImpactFingerprint,
}));

import { enforceProtectedDeliveryApproval } from "../src/enforce-protected-delivery-approval.js";
import { computeDeliveryTargetFingerprint } from "../src/protected-delivery-target.js";
import type { ProtectedDeliveryTarget } from "../src/protected-delivery-target.js";
import type { ProtectedChangeRecord } from "../src/protected-change-types.js";

const ORG = "org_00000000000000000000000001" as ProtectedChangeRecord["organizationId"];
const PROJECT = "prj_00000000000000000000000001" as ProtectedChangeRecord["projectId"];
const ENV = "env_00000000000000000000000001" as ProtectedChangeRecord["environmentId"];
const SYNC = "sync_0000000000000000000000001";
const OTHER_SYNC = "sync_0000000000000000000000009";
const PROTECTED_CHANGE_ID = requestId.brand("req_00000000000000000000000001");
const REQUEST_ID = requestId.brand("req_00000000000000000000000002");
const USER = "usr_00000000000000000000000001";
const FINGERPRINT = "impact-fingerprint-v1";

const ACTOR = { type: "user" as const, userId: USER as never };
const AUDIT_ACTOR = { type: "user" as const, userId: USER as never };

const TARGET: ProtectedDeliveryTarget = {
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  kind: "secret_sync_run",
  targetId: SYNC,
};

const APPROVED_RECORD: ProtectedChangeRecord = {
  protectedChangeId: PROTECTED_CHANGE_ID,
  organizationId: ORG,
  projectId: PROJECT,
  environmentId: ENV,
  state: "approved",
  purpose: "promotion",
  requesterUserId: USER as ProtectedChangeRecord["requesterUserId"],
  requesterMachineIdentityId: null,
  draftVersionIds: [],
  deliveryTarget: null,
  impactReviewFingerprint: FINGERPRINT,
  executionOperationId: null,
  closureReasonCode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const EVIDENCE_ID = "aud_00000000000000000000000001";

/** The authoritative approval-evidence row: the delivery-target fingerprint is SERVER state. */
async function approvedEvidence(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: EVIDENCE_ID,
    impactReviewFingerprint: FINGERPRINT,
    deliveryTargetFingerprint: await computeDeliveryTargetFingerprint(TARGET),
    consumedAt: null,
    ...overrides,
  };
}

function enforceInput(overrides: Record<string, unknown> = {}) {
  return {
    target: TARGET,
    protectedChangeId: PROTECTED_CHANGE_ID,
    actor: ACTOR,
    auditActor: AUDIT_ACTOR,
    requestId: REQUEST_ID,
    ...overrides,
  };
}

describe("enforceProtectedDeliveryApproval", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    accessMocks.authorizeScopeOrThrow.mockResolvedValue(undefined);
    storeMocks.getById.mockResolvedValue(APPROVED_RECORD);
    storeMocks.getApprovalEvidence.mockResolvedValue(await approvedEvidence());
    storeMocks.consumeApprovalEvidence.mockResolvedValue(
      await approvedEvidence({ consumedAt: "2026-01-01T00:00:00.000Z" }),
    );
    recomputeMocks.recomputeProtectedChangeImpactFingerprint.mockResolvedValue(FINGERPRINT);
    auditMocks.recordProtectedDeliveryApprovalAudit.mockResolvedValue(undefined);
  });

  it("authorizes execution with current matching approval evidence and records a success audit", async () => {
    const verdict = await enforceProtectedDeliveryApproval(enforceInput());

    expect(verdict).toMatchObject({
      status: "authorized",
      protectedChangeId: PROTECTED_CHANGE_ID,
      deliveryTargetKind: "secret_sync_run",
    });
    const auditArg = auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0];
    expect(auditArg).toMatchObject({ outcome: "success", target: TARGET });
    expect(auditArg.reasonCode).toBeUndefined();
  });

  it("consumes the approval evidence as part of authorization (single-use, INS-607)", async () => {
    await enforceProtectedDeliveryApproval(enforceInput());

    expect(storeMocks.consumeApprovalEvidence).toHaveBeenCalledTimes(1);
    expect(storeMocks.consumeApprovalEvidence).toHaveBeenCalledWith({
      organizationId: ORG,
      protectedChangeId: PROTECTED_CHANGE_ID,
      evidenceId: EVIDENCE_ID,
    });
  });

  it.each([
    "delivery_config",
    "secret_sync_enable",
    "secret_sync_run",
    "cloudflare_worker_secret_deploy",
  ] as const)(
    "fails closed with approval_not_authorized when replaying consumed evidence for %s",
    async (kind) => {
      const target: ProtectedDeliveryTarget = { ...TARGET, kind };
      storeMocks.getApprovalEvidence.mockResolvedValue(
        await approvedEvidence({
          deliveryTargetFingerprint: await computeDeliveryTargetFingerprint(target),
          consumedAt: "2026-01-01T00:00:00.000Z",
        }),
      );

      await expect(
        enforceProtectedDeliveryApproval(enforceInput({ target })),
      ).rejects.toMatchObject({ code: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized });
      expect(storeMocks.consumeApprovalEvidence).not.toHaveBeenCalled();
      expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
        outcome: "denied",
        reasonCode: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
      });
    },
  );

  it("fails closed with approval_not_authorized when the consume compare-and-set loses the race", async () => {
    // A concurrent execution consumed the evidence between the read and the CAS: the losing caller
    // must be denied — there is no window where one approval authorizes two executions.
    storeMocks.consumeApprovalEvidence.mockResolvedValue(null);

    await expect(enforceProtectedDeliveryApproval(enforceInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
    });
    expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
      outcome: "denied",
      reasonCode: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
    });
  });

  it("does not consume evidence when enforcement denies before the consume step", async () => {
    await expect(
      enforceProtectedDeliveryApproval(
        enforceInput({ target: { ...TARGET, targetId: OTHER_SYNC } }),
      ),
    ).rejects.toMatchObject({ code: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch });

    expect(storeMocks.consumeApprovalEvidence).not.toHaveBeenCalled();
  });

  it("fails closed with missing_evidence when no protected change record exists", async () => {
    storeMocks.getById.mockResolvedValue(null);

    await expect(enforceProtectedDeliveryApproval(enforceInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    });
    expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
      outcome: "denied",
      reasonCode: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    });
  });

  it("fails closed with missing_evidence when no approval-evidence row exists", async () => {
    storeMocks.getApprovalEvidence.mockResolvedValue(null);

    await expect(enforceProtectedDeliveryApproval(enforceInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    });
  });

  it("fails closed with review_stale when recorded evidence no longer matches current impact", async () => {
    recomputeMocks.recomputeProtectedChangeImpactFingerprint.mockResolvedValue("drifted");

    await expect(enforceProtectedDeliveryApproval(enforceInput())).rejects.toMatchObject({
      code: APPROVAL_ERROR_CODES.reviewStale,
    });
    expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
      outcome: "denied",
      reasonCode: APPROVAL_ERROR_CODES.reviewStale,
    });
  });

  it("cannot be satisfied by a caller recomputing the fingerprint for a forged target", async () => {
    // The stored evidence authorizes only SYNC. A caller requests OTHER_SYNC; there is NO caller
    // parameter to influence the approved fingerprint, and the live recompute of the forged target
    // will not equal the stored fingerprint. This is the core exact-target guarantee (INS-87).
    await expect(
      enforceProtectedDeliveryApproval(
        enforceInput({ target: { ...TARGET, targetId: OTHER_SYNC } }),
      ),
    ).rejects.toMatchObject({ code: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch });
    expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
      outcome: "denied",
      reasonCode: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
    });
  });

  it("fails closed with delivery_target_mismatch when the record coordinate differs from the target", async () => {
    storeMocks.getById.mockResolvedValue({
      ...APPROVED_RECORD,
      environmentId: "env_00000000000000000000000009" as ProtectedChangeRecord["environmentId"],
    });

    await expect(enforceProtectedDeliveryApproval(enforceInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
    });
  });

  it("fails closed with delivery_target_mismatch when a promotion approval carries no delivery fingerprint", async () => {
    storeMocks.getApprovalEvidence.mockResolvedValue(
      await approvedEvidence({ deliveryTargetFingerprint: null }),
    );

    await expect(enforceProtectedDeliveryApproval(enforceInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
    });
  });

  it.each(["rejected", "canceled", "stale", "pending_approval"] as const)(
    "fails closed with approval_not_authorized when the record is %s",
    async (state) => {
      storeMocks.getById.mockResolvedValue({ ...APPROVED_RECORD, state });

      await expect(enforceProtectedDeliveryApproval(enforceInput())).rejects.toMatchObject({
        code: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
      });
      expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
        outcome: "denied",
        reasonCode: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
      });
    },
  );

  it("fails closed and audits a scope denial with the insufficient_scope reason code", async () => {
    accessMocks.authorizeScopeOrThrow.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: AUTH_ERROR_CODES.insufficientScope }),
    );

    await expect(enforceProtectedDeliveryApproval(enforceInput())).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    expect(storeMocks.getById).not.toHaveBeenCalled();
    expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
      outcome: "denied",
      reasonCode: AUTH_ERROR_CODES.insufficientScope,
    });
  });

  it("preserves the fail-closed denial when the denied audit write itself throws", async () => {
    storeMocks.getById.mockResolvedValue(null);
    auditMocks.recordProtectedDeliveryApprovalAudit.mockRejectedValue(new Error("audit sink down"));

    await expect(enforceProtectedDeliveryApproval(enforceInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    });
  });

  it("keeps every enforcement output metadata-only with no sensitive value leakage", async () => {
    const verdict = await enforceProtectedDeliveryApproval(enforceInput());
    const serialized = JSON.stringify({
      verdict,
      audits: auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls,
    });
    // Every field must be a metadata-only value: opaque ids, the target-kind vocabulary, outcome,
    // or a sha256 fingerprint. No Sensitive Value, provider body, or child-process env may appear.
    const allowed = new Set([
      "status",
      "authorized",
      "protectedChangeId",
      PROTECTED_CHANGE_ID,
      "deliveryTargetKind",
      "secret_sync_run",
      "outcome",
      "success",
      "actor",
      "type",
      "user",
      "userId",
      USER,
      "target",
      "organizationId",
      ORG,
      "projectId",
      PROJECT,
      "environmentId",
      ENV,
      "kind",
      "targetId",
      SYNC,
    ]);
    const values = new Set<string>();
    const collect = (node: unknown): void => {
      if (typeof node === "string") {
        values.add(node);
      } else if (Array.isArray(node)) {
        node.forEach(collect);
      } else if (node !== null && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          values.add(key);
          collect(value);
        }
      }
    };
    const parsed = JSON.parse(serialized) as { verdict: unknown; audits: unknown };
    collect(parsed.verdict);
    collect(parsed.audits);
    const unexpected = [...values].filter((value) => !allowed.has(value));
    expect(unexpected).toEqual([]);
  });
});
