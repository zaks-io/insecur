import type { ConsoleApprovalRequestItem } from "./approval-items.js";
import { parseApprovalRequestEntry } from "./approval-request-items-parse.js";
import {
  parseImpactReview,
  type ConsoleApprovalRequestImpactDraftVersion,
  type ConsoleApprovalRequestImpactReview,
} from "./approval-request-impact-parse.js";

export type { ConsoleApprovalRequestImpactDraftVersion, ConsoleApprovalRequestImpactReview };

/** Detail read for one pending Approval Request (INS-86). */
export interface ConsoleApprovalRequestDetail extends ConsoleApprovalRequestItem {
  readonly commentLength: number | null;
  readonly rollbackSecretId: string | null;
  readonly rollbackToVersionId: string | null;
  readonly rollbackPromoteRequested: boolean;
  readonly impactReview: ConsoleApprovalRequestImpactReview;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredBooleanField(row: Record<string, unknown>, key: string): boolean | null {
  const value = row[key];
  return typeof value === "boolean" ? value : null;
}

function optionalNumberField(
  row: Record<string, unknown>,
  key: string,
): { readonly ok: true; readonly value: number | null } | { readonly ok: false } {
  const value = row[key];
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value === "number") {
    return { ok: true, value };
  }
  return { ok: false };
}

function optionalStringField(
  row: Record<string, unknown>,
  key: string,
): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
  const value = row[key];
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value === "string") {
    return { ok: true, value };
  }
  return { ok: false };
}

export function parseApprovalRequestDetailEntry(
  entry: unknown,
): ConsoleApprovalRequestDetail | null {
  const base = parseApprovalRequestEntry(entry);
  if (base === null || !isRecord(entry)) {
    return null;
  }
  const commentLength = optionalNumberField(entry, "commentLength");
  const rollbackSecretId = optionalStringField(entry, "rollbackSecretId");
  const rollbackToVersionId = optionalStringField(entry, "rollbackToVersionId");
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
