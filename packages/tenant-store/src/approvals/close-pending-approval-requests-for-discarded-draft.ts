import {
  approvalRequestId,
  type ApprovalRequestId,
  type OrganizationId,
  type SecretVersionId,
} from "@insecur/domain";
import { and, eq, inArray } from "drizzle-orm";

import {
  approvalRequests,
  promotionChangeSetDraftVersions,
} from "../db/schema/tenant-approval-requests.js";
import type { TenantScopedDb } from "../tenant-scoped-db.js";

export interface ClosePendingApprovalRequestsForDiscardedDraftVersionInput {
  readonly organizationId: OrganizationId;
  readonly secretVersionId: SecretVersionId;
}

/**
 * Draft Version Discard (ADR-0017): closes every pending Approval Request whose Promotion
 * Change Set includes the discarded Draft Version. Closing is not approval or rejection —
 * status moves straight to `draft_discard_closed` and any existing Partial Approvals on the
 * request become audit-only by virtue of the request no longer being pending.
 */
export async function closePendingApprovalRequestsForDiscardedDraftVersion(
  db: TenantScopedDb,
  input: ClosePendingApprovalRequestsForDiscardedDraftVersionInput,
): Promise<readonly ApprovalRequestId[]> {
  const affected = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .innerJoin(
      promotionChangeSetDraftVersions,
      and(
        eq(promotionChangeSetDraftVersions.orgId, approvalRequests.orgId),
        eq(promotionChangeSetDraftVersions.approvalRequestId, approvalRequests.id),
      ),
    )
    .where(
      and(
        eq(approvalRequests.orgId, input.organizationId),
        eq(approvalRequests.status, "pending"),
        eq(promotionChangeSetDraftVersions.secretVersionId, input.secretVersionId),
      ),
    )
    .for("update");

  if (affected.length === 0) {
    return [];
  }

  const ids = affected.map((row) => approvalRequestId.brand(row.id));
  await db
    .update(approvalRequests)
    .set({ status: "draft_discard_closed", updatedAt: new Date() })
    .where(
      and(
        eq(approvalRequests.orgId, input.organizationId),
        inArray(
          approvalRequests.id,
          ids.map((id) => id),
        ),
        eq(approvalRequests.status, "pending"),
      ),
    );

  return ids;
}
