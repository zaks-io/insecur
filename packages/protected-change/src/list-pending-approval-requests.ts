import type { OrganizationId } from "@insecur/domain";
import { TenantApprovalRequestStore, withTenantScope } from "@insecur/tenant-store";
import type { ActorRef } from "@insecur/access";

import { filterApprovalRequestsByEffectiveAccess } from "./approval-request-review-access.js";
import type { ApprovalRequestReviewListItem } from "./approval-request-review-types.js";
import { toApprovalRequestReviewListItem } from "./to-approval-request-review-item.js";

export interface ListPendingApprovalRequestsInput {
  readonly actor: ActorRef;
  readonly organizationId: OrganizationId;
}

export async function listPendingApprovalRequests(
  input: ListPendingApprovalRequestsInput,
): Promise<readonly ApprovalRequestReviewListItem[]> {
  const rows = await withTenantScope(
    { kind: "organization", organizationId: input.organizationId },
    ({ db }) =>
      new TenantApprovalRequestStore(db).listOrgPendingApprovalRequests({
        organizationId: input.organizationId,
      }),
  );

  const visible = await filterApprovalRequestsByEffectiveAccess(
    input.actor,
    input.organizationId,
    rows,
  );

  return visible.map(toApprovalRequestReviewListItem);
}
