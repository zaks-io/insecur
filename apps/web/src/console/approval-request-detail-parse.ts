import type { ConsoleApprovalRequestItem } from "./approval-items.js";
import { parseApprovalRequestEntry } from "./approval-request-items-parse.js";
import { parseImpactReview } from "./approval-request-impact-parse.js";
import type { ConsoleApprovalRequestImpactReview } from "./approval-request-impact-types.js";
import {
  isRecord,
  optionalNullableStringField,
  optionalNumberField,
  requiredBooleanField,
} from "./approval-parse-helpers.js";

/** Detail read for one pending Approval Request (INS-86). */
export interface ConsoleApprovalRequestDetail extends ConsoleApprovalRequestItem {
  readonly commentLength: number | null;
  readonly rollbackSecretId: string | null;
  readonly rollbackToVersionId: string | null;
  readonly rollbackPromoteRequested: boolean;
  readonly impactReview: ConsoleApprovalRequestImpactReview;
}

function parseApprovalRequestDetailEntry(entry: unknown): ConsoleApprovalRequestDetail | null {
  const base = parseApprovalRequestEntry(entry);
  if (base === null || !isRecord(entry)) {
    return null;
  }
  const commentLength = optionalNumberField(entry, "commentLength");
  const rollbackSecretId = optionalNullableStringField(entry, "rollbackSecretId");
  const rollbackToVersionId = optionalNullableStringField(entry, "rollbackToVersionId");
  const rollbackPromoteRequested = requiredBooleanField(entry, "rollbackPromoteRequested");
  const impactReview = parseImpactReview(entry.impactReview);
  if (
    !commentLength.ok ||
    !rollbackSecretId.ok ||
    !rollbackToVersionId.ok ||
    rollbackPromoteRequested === null ||
    impactReview === null
  ) {
    return null;
  }
  return {
    ...base,
    commentLength: commentLength.value,
    rollbackSecretId: rollbackSecretId.value,
    rollbackToVersionId: rollbackToVersionId.value,
    rollbackPromoteRequested,
    impactReview,
  };
}

/**
 * Parse `GET /v1/orgs/:organizationId/approval-requests/:approvalRequestId` for the approval detail
 * page. Returns `null` for anything but the expected success envelope so loaders fail closed.
 */
export function parseOrgApprovalRequestDetailBody(
  body: unknown,
): ConsoleApprovalRequestDetail | null {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return null;
  }
  return parseApprovalRequestDetailEntry(body.data.approvalRequest);
}
