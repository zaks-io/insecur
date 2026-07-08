import {
  approvalRequestId,
  type ApprovalRequestId,
  type EnvironmentId,
  type MachineIdentityId,
  type OrganizationId,
  type ProjectId,
  type SecretId,
  type SecretVersionId,
  type UserId,
} from "@insecur/domain";

import type {
  APPROVAL_REQUEST_PURPOSES,
  APPROVAL_REQUEST_STATUSES,
} from "../db/schema/tenant-approval-requests.js";
import type {
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
  readonly toVersionId: SecretVersionId;
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

export interface ApprovalRequestDetailRow {
  readonly approvalRequestId: ApprovalRequestId;
  readonly purpose: ApprovalRequestPurpose;
  readonly status: ApprovalRequestStatus;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requesterUserId: UserId | null;
  readonly requesterMachineIdentityId: MachineIdentityId | null;
  readonly operationId: string | null;
  readonly impactReviewFingerprint: string | null;
  readonly commentLength: number | null;
  readonly createdAt: Date;
  readonly rollbackSecretId: SecretId | null;
  readonly rollbackToVersionId: SecretVersionId | null;
  readonly rollbackPromoteRequested: boolean;
}

interface ApprovalRequestDetailSelectRow {
  readonly id: string;
  readonly purpose: string;
  readonly status: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly requesterUserId: string | null;
  readonly requesterMachineIdentityId: string | null;
  readonly operationId: string | null;
  readonly impactReviewFingerprint: string | null;
  readonly commentLength: number | null;
  readonly createdAt: Date;
  readonly rollbackSecretId: string | null;
  readonly rollbackToVersionId: string | null;
  readonly rollbackPromoteRequested: boolean;
}

export function mapApprovalRequestDetailRow(
  row: ApprovalRequestDetailSelectRow,
): ApprovalRequestDetailRow {
  return {
    approvalRequestId: approvalRequestId.brand(row.id),
    purpose: row.purpose as ApprovalRequestPurpose,
    status: row.status as ApprovalRequestStatus,
    projectId: row.projectId as ProjectId,
    environmentId: row.environmentId as EnvironmentId,
    requesterUserId: row.requesterUserId as UserId | null,
    requesterMachineIdentityId: row.requesterMachineIdentityId as MachineIdentityId | null,
    operationId: row.operationId,
    impactReviewFingerprint: row.impactReviewFingerprint,
    commentLength: row.commentLength,
    createdAt: row.createdAt,
    rollbackSecretId: row.rollbackSecretId as SecretId | null,
    rollbackToVersionId: row.rollbackToVersionId as SecretVersionId | null,
    rollbackPromoteRequested: row.rollbackPromoteRequested,
  };
}
