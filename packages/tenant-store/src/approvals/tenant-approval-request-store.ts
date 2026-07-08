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
  type APPROVAL_REQUEST_PURPOSES,
  type APPROVAL_REQUEST_STATUSES,
} from "../db/schema/tenant-approval-requests.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";
import {
  commonApprovalRequestValues,
  draftVersionRow,
  type ApprovalRequestRequester,
  type PromotionDraftVersionTarget,
} from "./approval-request-rows.js";

export type {
  ApprovalRequestRequester,
  PromotionDraftVersionTarget,
} from "./approval-request-rows.js";

export type ApprovalRequestPurpose = (typeof APPROVAL_REQUEST_PURPOSES)[number];
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

export interface CreatePromotionApprovalRequestInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requester: ApprovalRequestRequester;
  readonly approvalRequestId: ApprovalRequestId;
  readonly operationId?: string;
  readonly impactReviewFingerprint: string;
  readonly commentLength?: number;
  readonly commentSha256?: string;
  readonly draftVersions: readonly PromotionDraftVersionTarget[];
}

export interface CreateRollbackApprovalRequestInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requester: ApprovalRequestRequester;
  readonly approvalRequestId: ApprovalRequestId;
  readonly operationId?: string;
  readonly impactReviewFingerprint: string;
  readonly commentLength?: number;
  readonly commentSha256?: string;
  readonly secretId: SecretId;
  readonly toVersionNumber: number;
  readonly promoteRequested: boolean;
  readonly draftVersion: PromotionDraftVersionTarget;
}

export interface ApprovalRequestListItemRow {
  readonly approvalRequestId: ApprovalRequestId;
  readonly purpose: ApprovalRequestPurpose;
  readonly status: ApprovalRequestStatus;
  readonly createdAt: Date;
  readonly operationId: string | null;
}

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
      rollbackToVersionNumber: null,
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
      rollbackToVersionNumber: input.toVersionNumber,
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
