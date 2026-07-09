import {
  approvalRequestId,
  type ApprovalRequestId,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
} from "@insecur/domain";
import { and, asc, eq, inArray } from "drizzle-orm";

import {
  approvalRequests,
  promotionChangeSetDraftVersions,
} from "../db/schema/tenant-approval-requests.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import {
  commonApprovalRequestValues,
  draftVersionRow,
  type PromotionDraftVersionTarget,
} from "./approval-request-rows.js";
import { closePendingApprovalRequestsForDiscardedDraftVersion } from "./close-pending-approval-requests-for-discarded-draft.js";
import {
  mapApprovalRequestDetailRow,
  type ApprovalRequestDetailRow,
  type ApprovalRequestListItemRow,
  type ApprovalRequestPurpose,
  type ApprovalRequestStatus,
  type CreatePromotionApprovalRequestInput,
  type CreateRollbackApprovalRequestInput,
} from "./approval-request-store-types.js";

const approvalRequestDetailColumns = {
  id: approvalRequests.id,
  purpose: approvalRequests.purpose,
  status: approvalRequests.status,
  projectId: approvalRequests.projectId,
  environmentId: approvalRequests.environmentId,
  requesterUserId: approvalRequests.requesterUserId,
  requesterMachineIdentityId: approvalRequests.requesterMachineIdentityId,
  operationId: approvalRequests.operationId,
  impactReviewFingerprint: approvalRequests.impactReviewFingerprint,
  commentLength: approvalRequests.commentLength,
  createdAt: approvalRequests.createdAt,
  rollbackSecretId: approvalRequests.rollbackSecretId,
  rollbackToVersionId: approvalRequests.rollbackToVersionId,
  rollbackPromoteRequested: approvalRequests.rollbackPromoteRequested,
} as const;

export type {
  ApprovalRequestRequester,
  PromotionDraftVersionTarget,
} from "./approval-request-rows.js";
export type {
  ApprovalRequestDetailRow,
  ApprovalRequestListItemRow,
  ApprovalRequestPurpose,
  ApprovalRequestStatus,
  CreatePromotionApprovalRequestInput,
  CreateRollbackApprovalRequestInput,
} from "./approval-request-store-types.js";

export class TenantApprovalRequestStore {
  constructor(private readonly db: TenantScopedDb) {}

  async supersedePendingPromotionRequests(input: {
    readonly organizationId: OrganizationId;
    readonly environmentId: EnvironmentId;
    readonly supersededByRequestId: ApprovalRequestId;
  }): Promise<readonly ApprovalRequestId[]> {
    // FOR UPDATE serializes concurrent supersessions for the same environment; combined with
    // the `approval_requests_one_pending_promotion_idx` partial unique index (the load-bearing
    // guard), this prevents two pending promotions for one Protected Environment (ADR-0017).
    const pending = await this.db
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.orgId, input.organizationId),
          eq(approvalRequests.environmentId, input.environmentId),
          eq(approvalRequests.purpose, "protected_promotion"),
          eq(approvalRequests.status, "pending"),
        ),
      )
      .for("update");

    if (pending.length === 0) {
      return [];
    }

    const ids = pending.map((row) => approvalRequestId.brand(row.id));
    await this.db
      .update(approvalRequests)
      .set({
        status: "superseded",
        supersededByRequestId: input.supersededByRequestId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(approvalRequests.orgId, input.organizationId),
          inArray(
            approvalRequests.id,
            ids.map((id) => id),
          ),
        ),
      );

    return ids;
  }

  async createPromotionApprovalRequest(input: CreatePromotionApprovalRequestInput): Promise<void> {
    const now = new Date();
    await this.db.insert(approvalRequests).values({
      ...commonApprovalRequestValues(input, now),
      purpose: "protected_promotion",
      rollbackSecretId: null,
      rollbackToVersionId: null,
      rollbackPromoteRequested: false,
    });

    if (input.draftVersions.length > 0) {
      await this.db
        .insert(promotionChangeSetDraftVersions)
        .values(
          input.draftVersions.map((target) =>
            draftVersionRow(input.organizationId, input.approvalRequestId, target, now),
          ),
        );
    }
  }

  async createRollbackApprovalRequest(input: CreateRollbackApprovalRequestInput): Promise<void> {
    const now = new Date();
    await this.db.insert(approvalRequests).values({
      ...commonApprovalRequestValues(input, now),
      purpose: "protected_rollback",
      rollbackSecretId: input.secretId,
      rollbackToVersionId: input.toVersionId,
      rollbackPromoteRequested: input.promoteRequested,
    });

    await this.db
      .insert(promotionChangeSetDraftVersions)
      .values(
        draftVersionRow(input.organizationId, input.approvalRequestId, input.draftVersion, now),
      );
  }

  async listEnvironmentApprovalRequests(input: {
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
  }): Promise<readonly ApprovalRequestListItemRow[]> {
    const rows = await this.db
      .select({
        id: approvalRequests.id,
        purpose: approvalRequests.purpose,
        status: approvalRequests.status,
        createdAt: approvalRequests.createdAt,
        operationId: approvalRequests.operationId,
      })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.orgId, input.organizationId),
          eq(approvalRequests.projectId, input.projectId),
          eq(approvalRequests.environmentId, input.environmentId),
        ),
      )
      .orderBy(asc(approvalRequests.createdAt));

    return rows.map((row) => ({
      approvalRequestId: approvalRequestId.brand(row.id),
      purpose: row.purpose as ApprovalRequestPurpose,
      status: row.status as ApprovalRequestStatus,
      createdAt: row.createdAt,
      operationId: row.operationId,
    }));
  }

  async getApprovalRequestById(input: {
    readonly organizationId: OrganizationId;
    readonly approvalRequestId: ApprovalRequestId;
  }): Promise<ApprovalRequestDetailRow | null> {
    const [row] = await this.db
      .select(approvalRequestDetailColumns)
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.orgId, input.organizationId),
          eq(approvalRequests.id, input.approvalRequestId),
        ),
      )
      .limit(1);

    return row === undefined ? null : mapApprovalRequestDetailRow(row);
  }

  async listOrgPendingApprovalRequests(input: {
    readonly organizationId: OrganizationId;
  }): Promise<readonly ApprovalRequestDetailRow[]> {
    const rows = await this.db
      .select(approvalRequestDetailColumns)
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.orgId, input.organizationId),
          eq(approvalRequests.status, "pending"),
        ),
      )
      .orderBy(asc(approvalRequests.createdAt));

    return rows.map((row) => mapApprovalRequestDetailRow(row));
  }

  async transitionPendingApprovalRequest(input: {
    readonly organizationId: OrganizationId;
    readonly approvalRequestId: ApprovalRequestId;
    readonly toStatus: Extract<ApprovalRequestStatus, "approved_applied" | "rejected" | "canceled">;
  }): Promise<boolean> {
    const updated = await this.db
      .update(approvalRequests)
      .set({ status: input.toStatus, updatedAt: new Date() })
      .where(
        and(
          eq(approvalRequests.orgId, input.organizationId),
          eq(approvalRequests.id, input.approvalRequestId),
          eq(approvalRequests.status, "pending"),
        ),
      )
      .returning({ id: approvalRequests.id });

    return updated.length > 0;
  }

  /** @see closePendingApprovalRequestsForDiscardedDraftVersion (ADR-0017 Draft Version Discard). */
  async closePendingApprovalRequestsForDiscardedDraftVersion(input: {
    readonly organizationId: OrganizationId;
    readonly secretVersionId: SecretVersionId;
  }): Promise<readonly ApprovalRequestId[]> {
    return closePendingApprovalRequestsForDiscardedDraftVersion(this.db, input);
  }

  async getDraftVersionsForRequest(input: {
    readonly organizationId: OrganizationId;
    readonly approvalRequestId: ApprovalRequestId;
  }): Promise<readonly PromotionDraftVersionTarget[]> {
    const rows = await this.db
      .select({
        secretId: promotionChangeSetDraftVersions.secretId,
        secretVersionId: promotionChangeSetDraftVersions.secretVersionId,
      })
      .from(promotionChangeSetDraftVersions)
      .where(
        and(
          eq(promotionChangeSetDraftVersions.orgId, input.organizationId),
          eq(promotionChangeSetDraftVersions.approvalRequestId, input.approvalRequestId),
        ),
      );

    return rows.map((row) => ({
      secretId: row.secretId as SecretId,
      secretVersionId: row.secretVersionId as SecretVersionId,
    }));
  }
}
