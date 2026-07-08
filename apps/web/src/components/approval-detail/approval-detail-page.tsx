import { getRouteApi } from "@tanstack/react-router";
import { ApprovalRequestEvidencePanel } from "./approval-request-evidence.js";
import { ApproveApprovalRequestPanel } from "./approve-approval-request-panel.js";
import { CancelApprovalRequestPanel } from "./cancel-approval-request-panel.js";
import { RejectApprovalRequestPanel } from "./reject-approval-request-panel.js";
import { HighAssuranceChallengeEvidencePanel } from "./high-assurance-challenge-evidence.js";
import { RejectChallengePanel } from "./reject-challenge-panel.js";
import { approvalInboxPath } from "../../console/approval-items.js";
import type { ConsoleApprovalRequestDetail } from "../../console/approval-request-detail-parse.js";
import type { ConsoleHighAssuranceChallengeDetail } from "../../console/approval-detail-parse.js";

const approvalDetailRoute = getRouteApi("/orgs/$orgId/approvals_/$id");

function ApprovalRequestDetailPanels({
  orgId,
  request,
}: {
  orgId: string;
  request: ConsoleApprovalRequestDetail;
}) {
  return (
    <>
      <ApprovalRequestEvidencePanel request={request} />
      <ApproveApprovalRequestPanel orgId={orgId} request={request} />
      <RejectApprovalRequestPanel orgId={orgId} approvalRequestId={request.id} />
      <CancelApprovalRequestPanel orgId={orgId} approvalRequestId={request.id} />
    </>
  );
}

function HighAssuranceChallengeDetailPanels({
  orgId,
  challenge,
}: {
  orgId: string;
  challenge: ConsoleHighAssuranceChallengeDetail;
}) {
  return (
    <>
      <HighAssuranceChallengeEvidencePanel challenge={challenge} />
      <RejectChallengePanel
        orgId={orgId}
        operationId={challenge.id}
        disabled={challenge.status !== "pending"}
      />
    </>
  );
}

/**
 * Human Approval Surface detail (INS-381, INS-86, docs/web-console-ux.md §Human Approval Surface).
 */
export function ApprovalDetailPage() {
  const data = approvalDetailRoute.useLoaderData();
  const { orgId, id } = approvalDetailRoute.useParams();

  return (
    <section className="px-4 py-6 sm:px-8 sm:py-10">
      <header className="border-b-2 border-ink pb-5 sm:pb-6">
        <p className="font-mono text-xs text-muted-foreground">
          <a
            href={approvalInboxPath(orgId)}
            className="underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Approvals
          </a>
          <span aria-hidden="true"> / </span>
          <span>{id}</span>
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">Review approval</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Metadata evidence for one pending decision. Clearing happens only in this authenticated
          view; deep links never carry approval authority.
        </p>
      </header>

      <div className="mt-6 flex flex-col gap-6 lg:mt-8 lg:gap-8">
        {data.kind === "approval_request" ? (
          <ApprovalRequestDetailPanels orgId={orgId} request={data.request} />
        ) : (
          <HighAssuranceChallengeDetailPanels orgId={orgId} challenge={data.challenge} />
        )}
      </div>
    </section>
  );
}
