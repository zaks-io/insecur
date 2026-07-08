import { getRouteApi } from "@tanstack/react-router";
import { ApprovalRequestUnsupportedPanel } from "./approval-request-unsupported.js";
import { HighAssuranceChallengeEvidencePanel } from "./high-assurance-challenge-evidence.js";
import { RejectChallengePanel } from "./reject-challenge-panel.js";
import { approvalInboxPath } from "../../console/approval-items.js";

const approvalDetailRoute = getRouteApi("/orgs/$orgId/approvals_/$id");

/**
 * Human Approval Surface detail (INS-381, docs/web-console-ux.md §Human Approval Surface). Fully
 * responsive; deep links route through login and back without carrying approval authority.
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
          <ApprovalRequestUnsupportedPanel orgId={orgId} />
        ) : (
          <>
            <HighAssuranceChallengeEvidencePanel challenge={data.challenge} />
            <RejectChallengePanel
              orgId={orgId}
              operationId={data.challenge.id}
              disabled={data.challenge.status !== "pending"}
            />
          </>
        )}
      </div>
    </section>
  );
}
