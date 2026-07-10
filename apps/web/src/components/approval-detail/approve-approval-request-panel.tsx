import { Button } from "@insecur/ui";
import type { ConsoleApprovalRequestDetail } from "../../console/approval-request-detail-parse.js";
import { approvalDetailPath } from "../../console/approval-items.js";

function approvalStepUpHref(orgId: string, request: ConsoleApprovalRequestDetail): string {
  const returnTo = approvalDetailPath(orgId, request.id);
  const params = new URLSearchParams({
    returnTo,
    organizationId: orgId,
    approvalRequestId: request.id,
    projectId: request.projectId,
    environmentId: request.environmentId,
    impactReviewFingerprint: request.impactReview.currentFingerprint,
  });
  return `/auth/approval-step-up?${params.toString()}`;
}

/** Approve a pending Approval Request behind passkey step-up (INS-86). */
export function ApproveApprovalRequestPanel({
  orgId,
  request,
}: {
  orgId: string;
  request: ConsoleApprovalRequestDetail;
}) {
  const disabled = request.impactReview.isStale;

  return (
    <section
      aria-labelledby="approve-approval-heading"
      className="rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <h2
          id="approve-approval-heading"
          className="text-2xl font-semibold tracking-tight leading-tight"
        >
          Approve
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Apply the promotion change set after passkey step-up. The challenge is the structural
          gate; evidence above supplies deliberateness.
        </p>
      </header>
      <div className="px-4 py-4 sm:px-5">
        {request.impactReview.isStale ? (
          <p className="mb-4 max-w-prose text-sm text-muted-foreground" role="status">
            Approval is blocked until the requester submits a fresh request with current impact
            facts.
          </p>
        ) : null}
        {disabled ? (
          <Button disabled className="w-full sm:w-auto motion-reduce:transition-none">
            Approve with passkey
          </Button>
        ) : (
          <Button asChild className="w-full sm:w-auto motion-reduce:transition-none">
            <a href={approvalStepUpHref(orgId, request)}>Approve with passkey</a>
          </Button>
        )}
      </div>
    </section>
  );
}
