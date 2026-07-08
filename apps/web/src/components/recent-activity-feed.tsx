import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { ConsoleAuditEvent } from "../console/audit-events.js";
import {
  createRecentActivityPoller,
  HOME_RECENT_ACTIVITY_POLL_MS,
} from "../console/recent-activity-poll.js";
import { loadOrgRecentActivity } from "../server/console-audit-events.js";
import { RecentActivityFeedContent } from "./recent-activity-feed-content.js";

/**
 * Home recent-activity panel (INS-372): SSR loader seeds the first page; client polling refreshes
 * without navigation (ADR-0051).
 */
export function RecentActivityFeed({
  orgId,
  initialEvents,
}: {
  orgId: string;
  initialEvents: readonly ConsoleAuditEvent[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const loadRecentActivity = useServerFn(loadOrgRecentActivity);

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  useEffect(() => {
    const poller = createRecentActivityPoller({
      poll: () => loadRecentActivity({ data: { organizationId: orgId } }),
      onUpdate: setEvents,
      intervalMs: HOME_RECENT_ACTIVITY_POLL_MS,
    });
    poller.start();
    return () => {
      poller.stop();
    };
  }, [loadRecentActivity, orgId]);

  return <RecentActivityFeedContent orgId={orgId} events={events} />;
}
