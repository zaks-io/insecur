import type {
  ApprovalRequestId,
  EnvironmentId,
  MachineIdentityId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  UserId,
} from "@insecur/domain";

export interface PromotionDraftVersionTarget {
  readonly secretId: SecretId;
  readonly secretVersionId: SecretVersionId;
}

/**
 * The User or Machine Identity that created an Approval Request. Exactly one is present;
 * the `approval_requests_requester_present_check` constraint enforces it at the database.
 */
export type ApprovalRequestRequester =
  | { readonly userId: UserId; readonly machineIdentityId?: undefined }
  | { readonly machineIdentityId: MachineIdentityId; readonly userId?: undefined };

export interface CommonApprovalRequestFields {
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly requester: ApprovalRequestRequester;
  readonly approvalRequestId: ApprovalRequestId;
  readonly operationId?: string;
  readonly impactReviewFingerprint: string;
  readonly commentLength?: number;
  readonly commentSha256?: string;
}

/** The columns every Approval Request row shares, regardless of purpose. */
export function commonApprovalRequestValues(input: CommonApprovalRequestFields, now: Date) {
  return {
    id: input.approvalRequestId,
    orgId: input.organizationId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    status: "pending" as const,
    requesterUserId: input.requester.userId ?? null,
    requesterMachineIdentityId: input.requester.machineIdentityId ?? null,
    operationId: input.operationId ?? null,
    impactReviewFingerprint: input.impactReviewFingerprint,
    commentLength: input.commentLength ?? null,
    commentSha256: input.commentSha256 ?? null,
    supersededByRequestId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function draftVersionRow(
  organizationId: OrganizationId,
  approvalRequestId: ApprovalRequestId,
  target: PromotionDraftVersionTarget,
  now: Date,
) {
  return {
    orgId: organizationId,
    approvalRequestId,
    secretId: target.secretId,
    secretVersionId: target.secretVersionId,
    createdAt: now,
  };
}
