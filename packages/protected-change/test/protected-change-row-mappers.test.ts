import { PROTECTED_CHANGE_ERROR_CODES } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import {
  toApprovalEvidence,
  toProtectedChangeRecord,
  type ApprovalEvidenceRow,
  type ProtectedChangeRow,
} from "../src/protected-change-row-mappers.js";

const DRAFT_VERSION_ID = "sv_00000000000000000000000099";

function baseRow(overrides: Partial<ProtectedChangeRow> = {}): ProtectedChangeRow {
  return {
    id: "req_00000000000000000000000001",
    org_id: "org_00000000000000000000000001",
    project_id: "prj_00000000000000000000000001",
    environment_id: "env_00000000000000000000000001",
    state: "proposed",
    purpose: "promotion",
    requester_user_id: "usr_00000000000000000000000001",
    requester_machine_identity_id: null,
    draft_version_ids: [DRAFT_VERSION_ID],
    delivery_target_kind: null,
    delivery_target_id: null,
    impact_review_fingerprint: null,
    execution_operation_id: null,
    closure_reason_code: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("toProtectedChangeRecord", () => {
  it("maps a stored row into a branded record with normalized timestamps", () => {
    const record = toProtectedChangeRecord(baseRow());

    expect(record.protectedChangeId).toBe("req_00000000000000000000000001");
    expect(record.organizationId).toBe("org_00000000000000000000000001");
    expect(record.projectId).toBe("prj_00000000000000000000000001");
    expect(record.environmentId).toBe("env_00000000000000000000000001");
    expect(record.state).toBe("proposed");
    expect(record.purpose).toBe("promotion");
    expect(record.requesterUserId).toBe("usr_00000000000000000000000001");
    expect(record.requesterMachineIdentityId).toBeNull();
    expect(record.draftVersionIds).toEqual([DRAFT_VERSION_ID]);
    expect(record.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(record.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });

  it("accepts machine-identity requesters and null-out user requester", () => {
    const record = toProtectedChangeRecord(
      baseRow({
        requester_user_id: null,
        requester_machine_identity_id: "mach_00000000000000000000000001",
      }),
    );

    expect(record.requesterUserId).toBeNull();
    expect(record.requesterMachineIdentityId).toBe("mach_00000000000000000000000001");
  });

  it("normalizes Date-typed timestamps to ISO strings", () => {
    const record = toProtectedChangeRecord(
      baseRow({
        created_at: new Date("2026-03-04T05:06:07.000Z"),
        updated_at: new Date("2026-03-04T05:06:08.000Z"),
      }),
    );

    expect(record.createdAt).toBe("2026-03-04T05:06:07.000Z");
    expect(record.updatedAt).toBe("2026-03-04T05:06:08.000Z");
  });

  it("drops non-string draft-version entries before parsing", () => {
    const record = toProtectedChangeRecord(
      baseRow({ draft_version_ids: [DRAFT_VERSION_ID, 42, null] }),
    );

    expect(record.draftVersionIds).toEqual([DRAFT_VERSION_ID]);
  });

  it("treats a non-array draft-version column as empty", () => {
    const record = toProtectedChangeRecord(baseRow({ draft_version_ids: null }));

    expect(record.draftVersionIds).toEqual([]);
  });

  it("rejects an unknown stored state as an invalid transition", () => {
    expect(() => toProtectedChangeRecord(baseRow({ state: "banana" }))).toThrowError(
      expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.invalidTransition }),
    );
  });

  it("rejects a stored draft-version id that is not a valid secret version id", () => {
    expect(() =>
      toProtectedChangeRecord(baseRow({ draft_version_ids: ["not-a-secret-version-id"] })),
    ).toThrowError(expect.objectContaining({ code: PROTECTED_CHANGE_ERROR_CODES.missingEvidence }));
  });
});

describe("toApprovalEvidence", () => {
  function evidenceRow(overrides: Partial<ApprovalEvidenceRow> = {}): ApprovalEvidenceRow {
    return {
      id: "aud_00000000000000000000000001",
      org_id: "org_00000000000000000000000001",
      protected_change_id: "req_00000000000000000000000001",
      approver_user_id: "usr_00000000000000000000000001",
      audit_event_id: "aud_00000000000000000000000002",
      operation_id: "op_00000000000000000000000001",
      impact_review_fingerprint: "impact-fingerprint-v1",
      delivery_target_fingerprint: "sha256:delivery-fingerprint-v1",
      consumed_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("maps an approval-evidence row into a branded record", () => {
    const evidence = toApprovalEvidence(evidenceRow());

    expect(evidence.evidenceId).toBe("aud_00000000000000000000000001");
    expect(evidence.protectedChangeId).toBe("req_00000000000000000000000001");
    expect(evidence.approverUserId).toBe("usr_00000000000000000000000001");
    expect(evidence.auditEventId).toBe("aud_00000000000000000000000002");
    expect(evidence.operationId).toBe("op_00000000000000000000000001");
    expect(evidence.impactReviewFingerprint).toBe("impact-fingerprint-v1");
    expect(evidence.deliveryTargetFingerprint).toBe("sha256:delivery-fingerprint-v1");
    expect(evidence.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("preserves a null operation id", () => {
    const evidence = toApprovalEvidence(evidenceRow({ operation_id: null }));

    expect(evidence.operationId).toBeNull();
  });

  it("preserves a null delivery-target fingerprint (promotion-only approval)", () => {
    const evidence = toApprovalEvidence(evidenceRow({ delivery_target_fingerprint: null }));

    expect(evidence.deliveryTargetFingerprint).toBeNull();
  });

  it("maps an unconsumed evidence row to a null consumedAt", () => {
    const evidence = toApprovalEvidence(evidenceRow());

    expect(evidence.consumedAt).toBeNull();
  });

  it("maps a consumed evidence row to an ISO consumedAt timestamp", () => {
    const evidence = toApprovalEvidence(
      evidenceRow({ consumed_at: new Date("2026-01-02T03:04:05.000Z") }),
    );

    expect(evidence.consumedAt).toBe("2026-01-02T03:04:05.000Z");
  });
});
