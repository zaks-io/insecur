import { createFileRoute, notFound } from "@tanstack/react-router";
import { ApprovalDetailPage } from "../components/approval-detail/approval-detail-page.js";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { consoleApprovalRouteKindFromId } from "../console/approval-detail-parse.js";
import { parseApprovalDetailSearch } from "../console/approval-detail-search.js";
import { requireConsoleRead } from "../console/route-guards.js";
import {
  loadOrgApprovalRequestDetail,
  loadOrgHighAssuranceChallengeDetail,
} from "../server/console-pending-approvals.js";

export const Route = createFileRoute("/orgs/$orgId/approvals_/$id")({
  validateSearch: parseApprovalDetailSearch,
  loader: async ({ params, location }) => {
    const kind = consoleApprovalRouteKindFromId(params.id);
    if (kind === "unknown") {
      throw notFound();
    }
    if (kind === "approval_request") {
      const request = requireConsoleRead(
        await loadOrgApprovalRequestDetail({
          data: { organizationId: params.orgId, approvalId: params.id },
        }),
        location.href,
      );
      return { kind: "approval_request" as const, request };
    }
    const challenge = requireConsoleRead(
      await loadOrgHighAssuranceChallengeDetail({
        data: { organizationId: params.orgId, approvalId: params.id },
      }),
      location.href,
    );
    return { kind: "high_assurance_challenge" as const, challenge };
  },
  component: ApprovalDetailPage,
  errorComponent: ConsoleFramedRouteError,
});
