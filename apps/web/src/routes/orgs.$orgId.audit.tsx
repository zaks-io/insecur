import { createFileRoute } from "@tanstack/react-router";
import { AuditEventTable } from "../components/audit/audit-event-table.js";
import { AuditFiltersForm } from "../components/audit/audit-filters-form.js";
import { AuditPagination } from "../components/audit/audit-pagination.js";
import { ConsoleFramedRouteError } from "../components/console-route-error.js";
import { auditSearchHasActiveFilters, parseAuditSearch } from "../console/audit-search.js";
import { requireConsoleRead } from "../console/route-guards.js";
import { loadOrgAuditEvents } from "../server/console-audit-events.js";

export const Route = createFileRoute("/orgs/$orgId/audit")({
  validateSearch: (search: Record<string, unknown>) => parseAuditSearch(search),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps, location }) => {
    const page = requireConsoleRead(
      await loadOrgAuditEvents({
        data: { organizationId: params.orgId, ...deps.search },
      }),
      location.href,
    );
    return { page, search: deps.search };
  },
  component: AuditPage,
  errorComponent: ConsoleFramedRouteError,
});

/**
 * Full filterable metadata event log (INS-376, docs/web-console-ux.md §Navigation item 3). Secret
 * values never render in this console.
 */
function AuditPage() {
  const { page, search } = Route.useLoaderData();
  const { orgId } = Route.useParams();
  const { events, nextCursor } = page;
  const activeFilters = auditSearchHasActiveFilters(search);

  return (
    <section className="px-5 py-8 sm:px-8 sm:py-10">
      <header className="border-b border-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight leading-tight sm:text-4xl">Audit</h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Metadata-only event log for this organization. Filter by actor, project, environment,
          event type, and time range; share the URL to preserve filters.
        </p>
      </header>

      <AuditFiltersForm search={search} />

      {events.length === 0 ? (
        <p className="mt-8 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {activeFilters
            ? "No audit events match the current filters."
            : "No audit events are visible in this organization yet."}
        </p>
      ) : (
        <AuditEventTable events={events} />
      )}

      <AuditPagination
        orgId={orgId}
        search={search}
        nextCursor={nextCursor}
        eventCount={events.length}
      />
    </section>
  );
}
