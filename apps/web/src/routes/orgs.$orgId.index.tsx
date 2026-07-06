import { ConsolePlaceholder } from "@insecur/ui";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";

export const Route = createFileRoute("/orgs/$orgId/")({
  component: OrgHomePage,
});

const orgRoute = getRouteApi("/orgs/$orgId");

/** Home (docs/web-console-ux.md §Center Of Gravity): Needs You above recent activity. */
function OrgHomePage() {
  const { activeOrg } = orgRoute.useLoaderData();

  return (
    <section className="px-5 py-8 sm:px-8 sm:py-10">
      <header className="border-b-2 border-ink pb-6">
        <h1 className="font-display text-3xl leading-tight sm:text-4xl">{activeOrg.displayName}</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{activeOrg.organizationId}</p>
      </header>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ConsolePlaceholder title="Needs you">
          Approval Requests and High-Assurance Challenges waiting on you will land here.
        </ConsolePlaceholder>
        <ConsolePlaceholder title="Recent activity">
          A feed of this organization's metadata events will land here.
        </ConsolePlaceholder>
      </div>
    </section>
  );
}
