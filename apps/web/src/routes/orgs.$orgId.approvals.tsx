import { createFileRoute } from "@tanstack/react-router";
import { PendingApprovalsInbox } from "../components/pending-approvals-inbox.js";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { loadOrgPendingApprovals } from "../server/console-pending-approvals.js";

export const Route = createFileRoute("/orgs/$orgId/approvals")({
  loader: async ({ params, location }) => {
    const pendingApprovals = requireConsoleRead(
      await loadOrgPendingApprovals({ data: { organizationId: params.orgId } }),
      location.href,
    );
    return { pendingApprovals };
  },
  component: ApprovalsPage,
  errorComponent: ConsoleFramedRouteError,
});

/**
 * Human Approval Surface inbox (INS-377, docs/web-console-ux.md §Human Approval Surface). Metadata
 * only; approve/reject actions live on the detail page behind step-up (next slice).
 */
function ApprovalsPage() {
  const { pendingApprovals } = Route.useLoaderData();
  const { orgId } = Route.useParams();

  return (
    <section className="px-5 py-8 sm:px-8 sm:py-10">
      <header className="border-b-2 border-ink pb-6">
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">Approvals</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Pending High-Assurance Challenges and Approval Requests waiting on you. This inbox shows
          metadata evidence only; clearing decisions happen on the review page with passkey step-up.
        </p>
      </header>
      <div className="mt-8">
        <PendingApprovalsInbox orgId={orgId} initialItems={pendingApprovals.items} />
      </div>
    </section>
  );
}
