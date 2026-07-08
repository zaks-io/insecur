import type { ConsoleRead } from "../server/console-read.js";
import type { ConsoleAuditEvent, ConsoleRecentActivity } from "./audit-events.js";
import { CONSOLE_READ_POLL_MS, createConsoleReadPoller } from "./console-read-poll.js";

export const HOME_RECENT_ACTIVITY_POLL_MS = CONSOLE_READ_POLL_MS;

export function recentActivityFromRead(
  read: ConsoleRead<ConsoleRecentActivity>,
): readonly ConsoleAuditEvent[] | null {
  return read.kind === "ok" ? read.value.events : null;
}

/** Client poll scheduler for Home recent activity. */
export function createRecentActivityPoller(input: {
  readonly poll: () => Promise<ConsoleRead<ConsoleRecentActivity>>;
  readonly onUpdate: (events: readonly ConsoleAuditEvent[]) => void;
  readonly intervalMs?: number;
}): { readonly start: () => void; readonly stop: () => void } {
  return createConsoleReadPoller({
    poll: input.poll,
    selectSnapshot: (read) => recentActivityFromRead(read as ConsoleRead<ConsoleRecentActivity>),
    onUpdate: input.onUpdate,
    ...(input.intervalMs === undefined ? {} : { intervalMs: input.intervalMs }),
  });
}
