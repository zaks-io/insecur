import { Button } from "@insecur/ui";
import { approvalInboxPath } from "../../console/approval-items.js";

/** Metadata-safe placeholder until AG6 Approval Request review lands (INS-381). */
export function ApprovalRequestUnsupportedPanel({ orgId }: { orgId: string }) {
  return (
    <section className="border-2 border-ink px-4 py-6 sm:px-6">
      <p className="font-mono text-xs text-muted-foreground">Approval Request</p>
      <h2 className="mt-1 font-display text-2xl leading-tight">Not yet supported in the console</h2>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
        Approval Request deep links resolve by opaque ID prefix, but change-set review content is
        blocked on the protected-change slice. No secret values or approval actions render here.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-5">
        <a href={approvalInboxPath(orgId)}>Back to approvals</a>
      </Button>
    </section>
  );
}
