import { PROTECTED_CHANGE_ERROR_CODES, requestId, secretVersionId } from "@insecur/domain";

import { ProtectedChangeError } from "./protected-change-errors.js";
import { isProtectedChangeState } from "./protected-change-states.js";
import {
  PROTECTED_DELIVERY_TARGET_KINDS,
  type ProtectedDeliveryTargetKind,
} from "./protected-delivery-target.js";
import {
  PROTECTED_CHANGE_PURPOSES,
  type ProtectedChangeApprovalEvidence,
  type ProtectedChangePurpose,
  type ProtectedChangeRecord,
} from "./protected-change-types.js";
import { toIsoTimestamp } from "@insecur/tenant-store";

export interface ProtectedChangeRow {
  id: string;
  org_id: string;
  project_id: string;
  environment_id: string;
  state: string;
  purpose: string;
  requester_user_id: string | null;
  requester_machine_identity_id: string | null;
  draft_version_ids: unknown;
  delivery_target_kind: string | null;
  delivery_target_id: string | null;
  impact_review_fingerprint: string | null;
  execution_operation_id: string | null;
  closure_reason_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ApprovalEvidenceRow {
  id: string;
  org_id: string;
  protected_change_id: string;
  approver_user_id: string;
  audit_event_id: string;
  operation_id: string | null;
  impact_review_fingerprint: string;
  delivery_target_fingerprint: string | null;
  consumed_at: Date | string | null;
  created_at: Date | string;
}

function parseDraftVersionIds(value: unknown): ProtectedChangeRecord["draftVersionIds"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => {
      const parsed = secretVersionId.parse(entry);
      if (!parsed.ok) {
        throw new ProtectedChangeError(
          PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
          "stored draft version id is invalid",
        );
      }
      return parsed.value;
    });
}

function parsePurpose(value: string): ProtectedChangePurpose {
  const purpose = PROTECTED_CHANGE_PURPOSES.find((candidate) => candidate === value);
  if (purpose === undefined) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.invalidTransition,
      `unknown protected change purpose: ${value}`,
    );
  }
  return purpose;
}

function parseDeliveryTarget(row: ProtectedChangeRow): ProtectedChangeRecord["deliveryTarget"] {
  if (row.delivery_target_kind === null || row.delivery_target_id === null) {
    return null;
  }
  const kind = PROTECTED_DELIVERY_TARGET_KINDS.find(
    (candidate): candidate is ProtectedDeliveryTargetKind => candidate === row.delivery_target_kind,
  );
  if (kind === undefined) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.deliveryTargetMismatch,
      `unknown stored delivery target kind: ${row.delivery_target_kind}`,
    );
  }
  return { kind, targetId: row.delivery_target_id };
}

export function toProtectedChangeRecord(row: ProtectedChangeRow): ProtectedChangeRecord {
  if (!isProtectedChangeState(row.state)) {
    throw new ProtectedChangeError(
      PROTECTED_CHANGE_ERROR_CODES.invalidTransition,
      `unknown protected change state: ${row.state}`,
    );
  }
  return {
    protectedChangeId: requestId.brand(row.id),
    organizationId: row.org_id as ProtectedChangeRecord["organizationId"],
    projectId: row.project_id as ProtectedChangeRecord["projectId"],
    environmentId: row.environment_id as ProtectedChangeRecord["environmentId"],
    state: row.state,
    purpose: parsePurpose(row.purpose),
    requesterUserId:
      row.requester_user_id === null
        ? null
        : (row.requester_user_id as ProtectedChangeRecord["requesterUserId"]),
    requesterMachineIdentityId:
      row.requester_machine_identity_id === null
        ? null
        : (row.requester_machine_identity_id as ProtectedChangeRecord["requesterMachineIdentityId"]),
    draftVersionIds: parseDraftVersionIds(row.draft_version_ids),
    deliveryTarget: parseDeliveryTarget(row),
    impactReviewFingerprint: row.impact_review_fingerprint,
    executionOperationId:
      row.execution_operation_id === null
        ? null
        : (row.execution_operation_id as ProtectedChangeRecord["executionOperationId"]),
    closureReasonCode: row.closure_reason_code,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export function toApprovalEvidence(row: ApprovalEvidenceRow): ProtectedChangeApprovalEvidence {
  return {
    evidenceId: row.id as ProtectedChangeApprovalEvidence["evidenceId"],
    organizationId: row.org_id as ProtectedChangeApprovalEvidence["organizationId"],
    protectedChangeId: requestId.brand(row.protected_change_id),
    approverUserId: row.approver_user_id as ProtectedChangeApprovalEvidence["approverUserId"],
    auditEventId: row.audit_event_id as ProtectedChangeApprovalEvidence["auditEventId"],
    operationId:
      row.operation_id === null
        ? null
        : (row.operation_id as ProtectedChangeApprovalEvidence["operationId"]),
    impactReviewFingerprint: row.impact_review_fingerprint,
    deliveryTargetFingerprint: row.delivery_target_fingerprint,
    consumedAt: row.consumed_at === null ? null : toIsoTimestamp(row.consumed_at),
    createdAt: toIsoTimestamp(row.created_at),
  };
}
