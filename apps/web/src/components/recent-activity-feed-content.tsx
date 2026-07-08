import { Badge } from "@insecur/ui";
import { formatConsoleAuditActorLabel } from "../console/audit-actor-label.js";
import type { ConsoleAuditEvent } from "../console/audit-events.js";
import { shortDate } from "../console/projects.js";
import { CliInvitation } from "./cli-invitation.js";

function AuditEventRow({ event }: { event: ConsoleAuditEvent }) {
  const actorLabel = formatConsoleAuditActorLabel(event);
  const resourceLabel =
    event.resource === null ? null : `${event.resource.type} ${event.resource.id}`;

  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="min-w-0 font-mono text-sm text-foreground">{event.eventCode}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {shortDate(event.createdAt)}
        </span>
      </div>
      <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{actorLabel}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant={event.outcome === "success" ? "solid" : "outline"}>{event.outcome}</Badge>
        {resourceLabel !== null ? (
          <span className="truncate font-mono text-xs text-muted-foreground">{resourceLabel}</span>
        ) : null}
      </div>
    </li>
  );
}

function RecentActivityRegister({ events }: { events: readonly ConsoleAuditEvent[] }) {
  return (
    <ul className="divide-y-2 divide-ink border-2 border-ink">
      {events.map((event) => (
        <AuditEventRow key={event.auditEventId} event={event} />
      ))}
    </ul>
  );
}

function RecentActivityEmptyState({ orgId }: { orgId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <CliInvitation
        title="No activity yet"
        command="insecur init"
        lead="This feed shows metadata-only audit events as your team works in this organization.
          Create a project and run your first command to start generating activity:"
        hint="After setup, actions like secret writes and runtime injection runs appear here
          automatically. Secret values never render in this console."
      />
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
        Already provisioned?{" "}
        <a
          href={`/orgs/${orgId}/projects/`}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Open Projects
        </a>{" "}
        or run{" "}
        <span className="font-mono text-xs text-foreground">
          insecur run -- &lt;your command&gt;
        </span>{" "}
        from a linked repo.
      </p>
    </div>
  );
}

/** Presentational recent-activity panel for Home. Polling wrapper is `RecentActivityFeed`. */
export function RecentActivityFeedContent({
  orgId,
  events,
}: {
  orgId: string;
  events: readonly ConsoleAuditEvent[];
}) {
  return (
    <section aria-label="Recent activity">
      <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink pb-3">
        <h2 className="font-display text-2xl leading-tight">Recent activity</h2>
        <p className="font-mono text-xs text-muted-foreground">
          {events.length === 1 ? "1 event" : `${String(events.length)} events`}
        </p>
      </div>
      {events.length === 0 ? (
        <RecentActivityEmptyState orgId={orgId} />
      ) : (
        <div className="mt-6">
          <RecentActivityRegister events={events} />
        </div>
      )}
    </section>
  );
}
