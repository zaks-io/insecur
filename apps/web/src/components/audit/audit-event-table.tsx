import { Badge } from "@insecur/ui";
import { formatConsoleAuditActorLabel } from "../../console/audit-actor-label.js";
import type { ConsoleAuditEvent } from "../../console/audit-events.js";

function AuditEventRow({ event }: { event: ConsoleAuditEvent }) {
  const scopeParts = [
    event.projectId === null ? null : `project ${event.projectId}`,
    event.environmentId === null ? null : `env ${event.environmentId}`,
  ].filter((part): part is string => part !== null);

  return (
    <tr className="border-t border-border align-top">
      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-muted-foreground">
        {event.createdAt}
      </td>
      <td className="px-4 py-3 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span>{event.eventCode}</span>
          <Badge variant={event.outcome === "denied" ? "solid" : "outline"}>{event.outcome}</Badge>
        </div>
        <p className="mt-1 text-muted-foreground">{event.resultCode}</p>
      </td>
      <td className="px-4 py-3 font-mono text-xs">{formatConsoleAuditActorLabel(event)}</td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {scopeParts.length === 0 ? "—" : scopeParts.join(" · ")}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        <div>{event.auditEventId}</div>
        {event.operationId !== null ? <div className="mt-1">op {event.operationId}</div> : null}
        {event.requestId !== null ? <div className="mt-1">req {event.requestId}</div> : null}
      </td>
    </tr>
  );
}

export function AuditEventTable({ events }: { events: readonly ConsoleAuditEvent[] }) {
  return (
    <div className="mt-8 overflow-x-auto rounded-xl border border-border bg-card">
      <table className="min-w-full border-collapse text-left">
        <thead className="border-b border-border bg-muted">
          <tr className="font-mono text-xs text-muted-foreground">
            <th className="px-4 py-3 font-normal">When</th>
            <th className="px-4 py-3 font-normal">Event</th>
            <th className="px-4 py-3 font-normal">Actor</th>
            <th className="px-4 py-3 font-normal">Scope</th>
            <th className="px-4 py-3 font-normal">IDs</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <AuditEventRow key={event.auditEventId} event={event} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
