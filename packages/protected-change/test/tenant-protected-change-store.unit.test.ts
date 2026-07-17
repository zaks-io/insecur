import { PROTECTED_CHANGE_ERROR_CODES, organizationId, requestId } from "@insecur/domain";
import type { TenantScopedSql } from "@insecur/tenant-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TenantProtectedChangeStore } from "../src/tenant-protected-change-store.js";
import type { ProtectedChangeRow } from "../src/protected-change-row-mappers.js";
import type {
  CreateProtectedChangeInput,
  TransitionProtectedChangeInput,
} from "../src/protected-change-types.js";

const ORG = organizationId.brand("org_00000000000000000000000001");
const PROTECTED_CHANGE_ID = requestId.brand("req_00000000000000000000000001");

function protectedChangeRow(overrides: Partial<ProtectedChangeRow> = {}): ProtectedChangeRow {
  return {
    id: "req_00000000000000000000000001",
    org_id: "org_00000000000000000000000001",
    project_id: "prj_00000000000000000000000001",
    environment_id: "env_00000000000000000000000001",
    state: "proposed",
    purpose: "promotion",
    requester_user_id: "usr_00000000000000000000000001",
    requester_machine_identity_id: null,
    draft_version_ids: ["sv_00000000000000000000000099"],
    delivery_target_kind: null,
    delivery_target_id: null,
    impact_review_fingerprint: null,
    execution_operation_id: null,
    closure_reason_code: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/**
 * Builds a fake tagged-template `sql` that returns each queued result set in
 * order. `sql.typed` (used by bindJsonb) is a no-op passthrough.
 */
function fakeSql(resultSets: unknown[][]): TenantScopedSql {
  const queue = [...resultSets];
  const fn = vi.fn(async () => queue.shift() ?? []);
  (fn as unknown as { typed: unknown }).typed = (value: string) => value;
  return fn as unknown as TenantScopedSql;
}

const CREATE_INPUT: CreateProtectedChangeInput = {
  organizationId: ORG,
  projectId: "prj_00000000000000000000000001" as CreateProtectedChangeInput["projectId"],
  environmentId: "env_00000000000000000000000001" as CreateProtectedChangeInput["environmentId"],
  protectedChangeId: PROTECTED_CHANGE_ID,
  requester: { userId: "usr_00000000000000000000000001" as never },
  draftVersionIds: ["sv_00000000000000000000000099" as never],
};

describe("TenantProtectedChangeStore.getById", () => {
  it("returns null when no row matches", async () => {
    const store = new TenantProtectedChangeStore(fakeSql([[]]));
    expect(await store.getById(ORG, PROTECTED_CHANGE_ID)).toBeNull();
  });

  it("maps a matched row into a record", async () => {
    const store = new TenantProtectedChangeStore(fakeSql([[protectedChangeRow()]]));
    const record = await store.getById(ORG, PROTECTED_CHANGE_ID);
    expect(record?.protectedChangeId).toBe(PROTECTED_CHANGE_ID);
    expect(record?.state).toBe("proposed");
  });
});

describe("TenantProtectedChangeStore.insertProtectedChange", () => {
  it("validates input before issuing the insert", async () => {
    const sql = fakeSql([[protectedChangeRow()]]);
    const store = new TenantProtectedChangeStore(sql);

    await expect(
      store.insertProtectedChange({ ...CREATE_INPUT, requester: {} }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence }),
    );
    expect(sql).not.toHaveBeenCalled();
  });

  it("returns the inserted record on success", async () => {
    const store = new TenantProtectedChangeStore(fakeSql([[protectedChangeRow()]]));
    const record = await store.insertProtectedChange(CREATE_INPUT);
    expect(record.state).toBe("proposed");
  });

  it("maps a unique-constraint violation to activeChangeExists", async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error("dup"), { code: "23505" });
    });
    (fn as unknown as { typed: unknown }).typed = (value: string) => value;
    const store = new TenantProtectedChangeStore(fn as unknown as TenantScopedSql);

    await expect(store.insertProtectedChange(CREATE_INPUT)).rejects.toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.activeChangeExists }),
    );
  });

  it("rethrows a non-unique database error unchanged", async () => {
    const fn = vi.fn(async () => {
      throw new Error("connection reset");
    });
    (fn as unknown as { typed: unknown }).typed = (value: string) => value;
    const store = new TenantProtectedChangeStore(fn as unknown as TenantScopedSql);

    await expect(store.insertProtectedChange(CREATE_INPUT)).rejects.toThrow("connection reset");
  });
});

describe("TenantProtectedChangeStore.applyTransition", () => {
  const transition: TransitionProtectedChangeInput = {
    organizationId: ORG,
    protectedChangeId: PROTECTED_CHANGE_ID,
    nextState: "pending_approval",
  };

  it("rejects a transition on a protected change that does not exist", async () => {
    const store = new TenantProtectedChangeStore(fakeSql([[]]));
    await expect(store.applyTransition(transition)).rejects.toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.notFound }),
    );
  });

  it("rejects a transition out of a terminal state", async () => {
    const store = new TenantProtectedChangeStore(
      fakeSql([[protectedChangeRow({ state: "canceled" })]]),
    );
    await expect(store.applyTransition(transition)).rejects.toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.terminalState }),
    );
  });

  it("rejects a transition the state machine disallows", async () => {
    const store = new TenantProtectedChangeStore(
      fakeSql([[protectedChangeRow({ state: "proposed" })]]),
    );
    await expect(
      store.applyTransition({ ...transition, nextState: "executing" }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.invalidTransition }),
    );
  });

  it("treats a lost compare-and-set race as an invalid transition", async () => {
    const store = new TenantProtectedChangeStore(
      fakeSql([[protectedChangeRow({ state: "proposed" })], []]),
    );
    await expect(store.applyTransition(transition)).rejects.toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.invalidTransition }),
    );
  });

  it("returns the updated record when the compare-and-set succeeds", async () => {
    const store = new TenantProtectedChangeStore(
      fakeSql([
        [protectedChangeRow({ state: "proposed" })],
        [protectedChangeRow({ state: "pending_approval" })],
      ]),
    );
    const updated = await store.applyTransition(transition);
    expect(updated.state).toBe("pending_approval");
  });
});

describe("TenantProtectedChangeStore approval evidence", () => {
  const evidenceRow = {
    id: "aud_00000000000000000000000001",
    org_id: "org_00000000000000000000000001",
    protected_change_id: "req_00000000000000000000000001",
    approver_user_id: "usr_00000000000000000000000001",
    audit_event_id: "aud_00000000000000000000000002",
    operation_id: null,
    impact_review_fingerprint: "impact-fingerprint-v1",
    delivery_target_fingerprint: "sha256:delivery-fingerprint-v1",
    consumed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  };

  const evidenceInput = {
    organizationId: ORG,
    protectedChangeId: PROTECTED_CHANGE_ID,
    evidenceId: "aud_00000000000000000000000001" as never,
    approverUserId: "usr_00000000000000000000000001" as never,
    auditEventId: "aud_00000000000000000000000002" as never,
    impactReviewFingerprint: "impact-fingerprint-v1",
    deliveryTargetFingerprint: "sha256:delivery-fingerprint-v1",
  };

  it("returns the inserted evidence", async () => {
    const store = new TenantProtectedChangeStore(fakeSql([[evidenceRow]]));
    const evidence = await store.insertApprovalEvidence(evidenceInput);
    expect(evidence.impactReviewFingerprint).toBe("impact-fingerprint-v1");
    expect(evidence.deliveryTargetFingerprint).toBe("sha256:delivery-fingerprint-v1");
  });

  it("throws when the evidence insert returns no row", async () => {
    const store = new TenantProtectedChangeStore(fakeSql([[]]));
    await expect(store.insertApprovalEvidence(evidenceInput)).rejects.toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence }),
    );
  });

  it("returns null when no evidence exists for the protected change", async () => {
    const store = new TenantProtectedChangeStore(fakeSql([[]]));
    expect(await store.getApprovalEvidence(ORG, PROTECTED_CHANGE_ID)).toBeNull();
  });

  it("maps a stored evidence row on read", async () => {
    const store = new TenantProtectedChangeStore(fakeSql([[evidenceRow]]));
    const evidence = await store.getApprovalEvidence(ORG, PROTECTED_CHANGE_ID);
    expect(evidence?.approverUserId).toBe("usr_00000000000000000000000001");
  });

  it("returns the consumed evidence when the consume compare-and-set wins", async () => {
    const store = new TenantProtectedChangeStore(
      fakeSql([[{ ...evidenceRow, consumed_at: "2026-01-02T00:00:00.000Z" }]]),
    );
    const consumed = await store.consumeApprovalEvidence({
      organizationId: ORG,
      protectedChangeId: PROTECTED_CHANGE_ID,
      evidenceId: "aud_00000000000000000000000001" as never,
    });
    expect(consumed?.consumedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("returns null when the evidence was already consumed (lost the single-use race)", async () => {
    const store = new TenantProtectedChangeStore(fakeSql([[]]));
    const consumed = await store.consumeApprovalEvidence({
      organizationId: ORG,
      protectedChangeId: PROTECTED_CHANGE_ID,
      evidenceId: "aud_00000000000000000000000001" as never,
    });
    expect(consumed).toBeNull();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
