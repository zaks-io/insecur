import { Button } from "@insecur/ui";
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { ConsoleFrame } from "../components/console-frame.js";
import { ConsoleRouteError } from "../components/console-route-error.js";
import { SiteFrame } from "../components/site-frame.js";
import { findConsoleOrganization } from "../console/organizations.js";
import { requireConsoleSession } from "../console/route-guards.js";
import { loadApprovalPasskeyPosture } from "../server/approval-passkey-posture.js";
import { loadConsoleSession } from "../server/console-session.js";

export const Route = createFileRoute("/orgs/$orgId")({
  // One memberships read per org entry; section switches inside the shell reuse it briefly.
  staleTime: 30_000,
  loader: async ({ params, location }) => {
    const session = requireConsoleSession(await loadConsoleSession(), location.href);
    // Metadata-safe denial: a non-member org ID is indistinguishable from a nonexistent one.
    const activeOrg = findConsoleOrganization(session.organizations, params.orgId);
    if (activeOrg === undefined) {
      throw notFound();
    }
    const passkeyPosture = await loadApprovalPasskeyPosture();
    return {
      organizations: session.organizations,
      activeOrg,
      passkeyEnrolled: passkeyPosture.kind === "authenticated" && passkeyPosture.enrolled,
    };
  },
  component: OrgLayout,
  notFoundComponent: OrgNotFound,
  errorComponent: ConsoleRouteError,
});

function OrgLayout() {
  const { organizations, activeOrg, passkeyEnrolled } = Route.useLoaderData();
  return (
    <ConsoleFrame
      organizations={organizations}
      activeOrg={activeOrg}
      passkeyEnrolled={passkeyEnrolled}
    >
      <Outlet />
    </ConsoleFrame>
  );
}

function OrgNotFound() {
  return (
    <SiteFrame>
      <section className="px-5 py-10 sm:px-8 sm:py-12">
        <div className="max-w-xl border-2 border-ink px-6 py-6">
          <p className="font-mono text-xs text-muted-foreground">404</p>
          <h1 className="mt-1 font-display text-2xl leading-tight">Not found</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This organization doesn't exist or you don't have access to it.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-5">
            <a href="/orgs">Go to your console</a>
          </Button>
        </div>
      </section>
    </SiteFrame>
  );
}
