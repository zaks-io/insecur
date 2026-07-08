import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { NeedsYouStrip } from "../components/needs-you-strip.js";
import { RecentActivityFeed } from "../components/recent-activity-feed.js";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { loadOrgRecentActivity } from "../server/console-audit-events.js";
import { loadOrgPendingApprovals } from "../server/console-pending-approvals.js";

export const Route = createFileRoute("/orgs/$orgId/")({
  loader: async ({ params, location }) => {
    const [recentActivityRead, pendingApprovalsRead] = await Promise.all([
      loadOrgRecentActivity({ data: { organizationId: params.orgId } }),
      loadOrgPendingApprovals({ data: { organizationId: params.orgId } }),
    ]);
    const recentActivity = requireConsoleRead(recentActivityRead, location.href);
    const pendingApprovals = requireConsoleRead(pendingApprovalsRead, location.href);
    return { recentActivity, pendingApprovals };
  },
  component: OrgHomePage,
  errorComponent: ConsoleFramedRouteError,
});

const orgRoute = getRouteApi("/orgs/$orgId");

/** Home (docs/web-console-ux.md §Center Of Gravity): Needs You above recent activity. */
function OrgHomePage() {
  const { activeOrg } = orgRoute.useLoaderData();
  const { recentActivity, pendingApprovals } = Route.useLoaderData();
  const { orgId } = Route.useParams();

  return (
    <section className="px-5 py-8 sm:px-8 sm:py-10">
      <header className="border-b-2 border-ink pb-6">
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">{activeOrg.displayName}</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{activeOrg.organizationId}</p>
      </header>
      <div className="mt-8 flex flex-col gap-8">
        <NeedsYouStrip orgId={orgId} initialItems={pendingApprovals.items} />
        <RecentActivityFeed orgId={orgId} initialEvents={recentActivity.events} />
      </div>
    </section>
  );
}
