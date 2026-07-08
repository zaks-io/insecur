import { createFileRoute, notFound } from "@tanstack/react-router";
import { ApprovalDetailPage } from "../components/approval-detail/approval-detail-page.js";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { consoleApprovalRouteKindFromId } from "../console/approval-detail-parse.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { loadOrgHighAssuranceChallengeDetail } from "../server/console-pending-approvals.js";

export const Route = createFileRoute("/orgs/$orgId/approvals_/$id")({
  loader: async ({ params, location }) => {
    const kind = consoleApprovalRouteKindFromId(params.id);
    if (kind === "unknown") {
      throw notFound();
    }
    if (kind === "approval_request") {
      return { kind: "approval_request" as const };
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
