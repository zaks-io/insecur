import {
  approvalRequestId,
  type ApprovalRequestId,
  type EnvironmentId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
  type UserId,
} from "@insecur/domain";
import { and, asc, eq, inArray } from "drizzle-orm";

import {
  approvalRequests,
  promotionChangeSetDraftVersions,
  type APPROVAL_REQUEST_PURPOSES,
  type APPROVAL_REQUEST_STATUSES,
} from "../db/schema/tenant-approval-requests.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";

export type ApprovalRequestPurpose = (typeof APPROVAL_REQUEST_PURPOSES)[number];
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

export interface PromotionDraftVersionTarget {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
}

export interface CreatePromotionApprovalRequestInput {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requesterUserId: UserId;
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
  readonly requesterUserId: UserId;
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
      );

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
      id: input.approvalRequestId,
      orgId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      purpose: "protected_promotion",
      status: "pending",
      requesterUserId: input.requesterUserId,
      operationId: input.operationId ?? null,
      impactReviewFingerprint: input.impactReviewFingerprint,
      commentLength: input.commentLength ?? null,
      commentSha256: input.commentSha256 ?? null,
      rollbackSecretId: null,
      rollbackToVersionNumber: null,
      rollbackPromoteRequested: false,
      supersededByRequestId: null,
      createdAt: now,
      updatedAt: now,
    });

    if (input.draftVersions.length > 0) {
      await this.db.insert(promotionChangeSetDraftVersions).values(
        input.draftVersions.map((target) => ({
          orgId: input.organizationId,
          approvalRequestId: input.approvalRequestId,
          secretId: target.secretId,
          secretVersionId: target.secretVersionId,
          createdAt: now,
        })),
      );
    }
  }

  async createRollbackApprovalRequest(input: CreateRollbackApprovalRequestInput): Promise<void> {
    const now = new Date();
    await this.db.insert(approvalRequests).values({
      id: input.approvalRequestId,
      orgId: input.organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      purpose: "protected_rollback",
      status: "pending",
      requesterUserId: input.requesterUserId,
      operationId: input.operationId ?? null,
      impactReviewFingerprint: input.impactReviewFingerprint,
      commentLength: input.commentLength ?? null,
      commentSha256: input.commentSha256 ?? null,
      rollbackSecretId: input.secretId,
      rollbackToVersionNumber: input.toVersionNumber,
      rollbackPromoteRequested: input.promoteRequested,
      supersededByRequestId: null,
      createdAt: now,
      updatedAt: now,
    });

    await this.db.insert(promotionChangeSetDraftVersions).values({
      orgId: input.organizationId,
      approvalRequestId: input.approvalRequestId,
      secretId: input.draftVersion.secretId,
      secretVersionId: input.draftVersion.secretVersionId,
      createdAt: now,
    });
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
