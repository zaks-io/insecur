import { Button } from "@insecur/ui";
import { Link } from "@tanstack/react-router";
import { buildAuditSearchQuery, type AuditSearchParams } from "../../console/audit-search.js";

export function AuditPagination({
  orgId,
  search,
  nextCursor,
  eventCount,
}: {
  orgId: string;
  search: AuditSearchParams;
  nextCursor: string | null;
  eventCount: number;
}) {
  if (nextCursor === null) {
    return (
      <p className="mt-4 font-mono text-xs text-muted-foreground">
        {eventCount === 0 ? "End of log." : `Showing ${String(eventCount)} events.`}
      </p>
    );
  }

  return (
    <div className="mt-6 flex items-center gap-4">
      <Button asChild variant="outline" size="sm">
        <Link
          to="/orgs/$orgId/audit"
          params={{ orgId }}
          search={buildAuditSearchQuery({ ...search, cursor: nextCursor })}
        >
          Next page
        </Link>
      </Button>
      <p className="font-mono text-xs text-muted-foreground">
        {String(eventCount)} events on this page
      </p>
    </div>
  );
}
