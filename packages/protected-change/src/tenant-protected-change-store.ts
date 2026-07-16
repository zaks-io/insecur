import { PROTECTED_CHANGE_ERROR_CODES, type OrganizationId, type RequestId } from "@insecur/domain";
import {
  bindJsonb,
  isUniqueConstraintViolation,
  type TenantScopedSql,
} from "@insecur/tenant-store";

import { ProtectedChangeError } from "./protected-change-errors.js";
import {
  isProtectedChangeTransitionAllowed,
  isTerminalProtectedChangeState,
} from "./protected-change-states.js";
import {
  toApprovalEvidence,
  toProtectedChangeRecord,
  type ApprovalEvidenceRow,
  type ProtectedChangeRow,
} from "./protected-change-row-mappers.js";
import type {
  CreateProtectedChangeInput,
  ProtectedChangeApprovalEvidence,
  ProtectedChangeRecord,
  RecordProtectedChangeApprovalEvidenceInput,
  TransitionProtectedChangeInput,
} from "./protected-change-types.js";
import { validateCreateProtectedChangeInput } from "./validate-create-protected-change.js";

export class TenantProtectedChangeStore {
  constructor(private readonly sql: TenantScopedSql) {}

  async getById(
    organizationId: OrganizationId,
    protectedChangeId: RequestId,
  ): Promise<ProtectedChangeRecord | null> {
    const rows = await this.sql<ProtectedChangeRow[]>`
      SELECT *
      FROM protected_changes
      WHERE org_id = ${organizationId}
        AND id = ${protectedChangeId}
      LIMIT 1
    `;
    const row = rows[0];
    return row === undefined ? null : toProtectedChangeRecord(row);
  }

  async insertProtectedChange(input: CreateProtectedChangeInput): Promise<ProtectedChangeRecord> {
    validateCreateProtectedChangeInput(input);

    try {
      const rows = await this.sql<ProtectedChangeRow[]>`
        INSERT INTO protected_changes (
          id,
          org_id,
          project_id,
          environment_id,
          state,
          purpose,
          requester_user_id,
          requester_machine_identity_id,
          draft_version_ids
        )
        VALUES (
          ${input.protectedChangeId},
          ${input.organizationId},
          ${input.projectId},
          ${input.environmentId},
          'proposed',
          ${input.purpose ?? "promotion"},
          ${input.requester.userId ?? null},
          ${input.requester.machineIdentityId ?? null},
          ${bindJsonb(this.sql, [...input.draftVersionIds])}
        )
        RETURNING *
      `;
      const row = rows[0];
      if (row === undefined) {
        throw new ProtectedChangeError(
          PROTECTED_CHANGE_ERROR_CODES.notFound,
          "protected change insert failed",
        );
      }
      return toProtectedChangeRecord(row);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ProtectedChangeError(
          PROTECTED_CHANGE_ERROR_CODES.activeChangeExists,
          "protected environment already has an active protected change",
        );
      }
      throw error;
    }
  }

  async applyTransition(input: TransitionProtectedChangeInput): Promise<ProtectedChangeRecord> {
    const current = await this.getById(input.organizationId, input.protectedChangeId);
    if (current === null) {
      throw new ProtectedChangeError(
        PROTECTED_CHANGE_ERROR_CODES.notFound,
        "protected change not found",
      );
    }
    if (isTerminalProtectedChangeState(current.state)) {
      throw new ProtectedChangeError(
        PROTECTED_CHANGE_ERROR_CODES.terminalState,
        `protected change is terminal: ${current.state}`,
      );
    }
    if (!isProtectedChangeTransitionAllowed(current.state, input.nextState)) {
      throw new ProtectedChangeError(
        PROTECTED_CHANGE_ERROR_CODES.invalidTransition,
        `protected change transition not allowed: ${current.state} -> ${input.nextState}`,
      );
    }

    const rows = await this.sql<ProtectedChangeRow[]>`
      UPDATE protected_changes
      SET
        state = ${input.nextState},
        impact_review_fingerprint = COALESCE(${input.impactReviewFingerprint ?? null}, impact_review_fingerprint),
        execution_operation_id = COALESCE(${input.executionOperationId ?? null}, execution_operation_id),
        closure_reason_code = COALESCE(${input.closureReasonCode ?? null}, closure_reason_code),
        updated_at = NOW()
      WHERE org_id = ${input.organizationId}
        AND id = ${input.protectedChangeId}
        AND state = ${current.state}
      RETURNING *
    `;
    const row = rows[0];
    if (row === undefined) {
      throw new ProtectedChangeError(
        PROTECTED_CHANGE_ERROR_CODES.invalidTransition,
        "protected change transition lost compare-and-set race",
      );
    }
    return toProtectedChangeRecord(row);
  }

  async insertApprovalEvidence(
    input: RecordProtectedChangeApprovalEvidenceInput,
  ): Promise<ProtectedChangeApprovalEvidence> {
    const rows = await this.sql<ApprovalEvidenceRow[]>`
      INSERT INTO protected_change_approval_evidence (
        id,
        org_id,
        protected_change_id,
        approver_user_id,
        audit_event_id,
        operation_id,
        impact_review_fingerprint,
        delivery_target_fingerprint
      )
      VALUES (
        ${input.evidenceId},
        ${input.organizationId},
        ${input.protectedChangeId},
        ${input.approverUserId},
        ${input.auditEventId},
        ${input.operationId ?? null},
        ${input.impactReviewFingerprint},
        ${input.deliveryTargetFingerprint ?? null}
      )
      RETURNING *
    `;
    const row = rows[0];
    if (row === undefined) {
      throw new ProtectedChangeError(
        PROTECTED_CHANGE_ERROR_CODES.missingEvidence,
        "approval evidence insert failed",
      );
    }
    return toApprovalEvidence(row);
  }

  async getApprovalEvidence(
    organizationId: OrganizationId,
    protectedChangeId: RequestId,
  ): Promise<ProtectedChangeApprovalEvidence | null> {
    const rows = await this.sql<ApprovalEvidenceRow[]>`
      SELECT *
      FROM protected_change_approval_evidence
      WHERE org_id = ${organizationId}
        AND protected_change_id = ${protectedChangeId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const row = rows[0];
    return row === undefined ? null : toApprovalEvidence(row);
  }
}
