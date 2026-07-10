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
    return { getById: storeMocks.getById, getApprovalEvidence: storeMocks.getApprovalEvidence };
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
  impactReviewFingerprint: FINGERPRINT,
  executionOperationId: null,
  closureReasonCode: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function enforceInput(overrides: Record<string, unknown> = {}) {
  return {
    target: TARGET,
    protectedChangeId: PROTECTED_CHANGE_ID,
    approvedDeliveryTargetFingerprint: await computeDeliveryTargetFingerprint(TARGET),
    actor: ACTOR,
    auditActor: AUDIT_ACTOR,
    requestId: REQUEST_ID,
    ...overrides,
  };
}

describe("enforceProtectedDeliveryApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMocks.authorizeScopeOrThrow.mockResolvedValue(undefined);
    storeMocks.getById.mockResolvedValue(APPROVED_RECORD);
    storeMocks.getApprovalEvidence.mockResolvedValue({ impactReviewFingerprint: FINGERPRINT });
    recomputeMocks.recomputeProtectedChangeImpactFingerprint.mockResolvedValue(FINGERPRINT);
    auditMocks.recordProtectedDeliveryApprovalAudit.mockResolvedValue(undefined);
  });

  it("authorizes execution with current matching approval evidence and records a success audit", async () => {
    const verdict = await enforceProtectedDeliveryApproval(await enforceInput());

    expect(verdict).toMatchObject({
      status: "authorized",
      protectedChangeId: PROTECTED_CHANGE_ID,
      deliveryTargetKind: "secret_sync_run",
    });
    const auditArg = auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0];
    expect(auditArg).toMatchObject({ outcome: "success", target: TARGET });
    expect(auditArg.reasonCode).toBeUndefined();
  });

  it("fails closed with missing_evidence when no protected change record exists", async () => {
    storeMocks.getById.mockResolvedValue(null);

    await expect(enforceProtectedDeliveryApproval(await enforceInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    });
    expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
      outcome: "denied",
      reasonCode: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    });
  });

  it("fails closed with review_stale when recorded evidence no longer matches current impact", async () => {
    recomputeMocks.recomputeProtectedChangeImpactFingerprint.mockResolvedValue("drifted");

    await expect(enforceProtectedDeliveryApproval(await enforceInput())).rejects.toMatchObject({
      code: APPROVAL_ERROR_CODES.reviewStale,
    });
    expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
      outcome: "denied",
      reasonCode: APPROVAL_ERROR_CODES.reviewStale,
    });
  });

  it("fails closed with delivery_target_mismatch when the approval covered a different target", async () => {
    const otherTargetFingerprint = await computeDeliveryTargetFingerprint({
      ...TARGET,
      targetId: "sync_0000000000000000000000009",
    });

    await expect(
      enforceProtectedDeliveryApproval(
        await enforceInput({ approvedDeliveryTargetFingerprint: otherTargetFingerprint }),
      ),
    ).rejects.toMatchObject({ code: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch });
    expect(storeMocks.getApprovalEvidence).not.toHaveBeenCalled();
  });

  it("fails closed with delivery_target_mismatch when the record coordinate differs from the target", async () => {
    storeMocks.getById.mockResolvedValue({
      ...APPROVED_RECORD,
      environmentId: "env_00000000000000000000000009" as ProtectedChangeRecord["environmentId"],
    });

    await expect(enforceProtectedDeliveryApproval(await enforceInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
    });
  });

  it("fails closed with delivery_target_mismatch when a promotion approval carries no delivery fingerprint", async () => {
    await expect(
      enforceProtectedDeliveryApproval(
        await enforceInput({ approvedDeliveryTargetFingerprint: null }),
      ),
    ).rejects.toMatchObject({ code: PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch });
  });

  it.each(["rejected", "canceled", "stale", "pending_approval"] as const)(
    "fails closed with approval_not_authorized when the record is %s",
    async (state) => {
      storeMocks.getById.mockResolvedValue({ ...APPROVED_RECORD, state });

      await expect(enforceProtectedDeliveryApproval(await enforceInput())).rejects.toMatchObject({
        code: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
      });
      expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
        outcome: "denied",
        reasonCode: PROTECTED_CHANGE_ERROR_CODES.approvalNotAuthorized,
      });
    },
  );

  it("fails closed and audits denial when the actor lacks delivery scope", async () => {
    accessMocks.authorizeScopeOrThrow.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { code: AUTH_ERROR_CODES.insufficientScope }),
    );

    await expect(enforceProtectedDeliveryApproval(await enforceInput())).rejects.toMatchObject({
      code: AUTH_ERROR_CODES.insufficientScope,
    });
    expect(storeMocks.getById).not.toHaveBeenCalled();
    expect(auditMocks.recordProtectedDeliveryApprovalAudit.mock.calls.at(-1)?.[0]).toMatchObject({
      outcome: "denied",
    });
  });

  it("preserves the fail-closed denial when the denied audit write itself throws", async () => {
    storeMocks.getById.mockResolvedValue(null);
    auditMocks.recordProtectedDeliveryApprovalAudit.mockRejectedValue(new Error("audit sink down"));

    await expect(enforceProtectedDeliveryApproval(await enforceInput())).rejects.toMatchObject({
      code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
    });
  });

  it("keeps every enforcement output metadata-only with no sensitive value leakage", async () => {
    const verdict = await enforceProtectedDeliveryApproval(await enforceInput());
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
