import type { ConsoleRead } from "../server/console-read.js";
import type { ConsoleAuditEvent, ConsoleRecentActivity } from "./audit-events.js";

/** Modest client poll interval for Home recent activity (ADR-0051: V1 uses polling, not SSE). */
export const HOME_RECENT_ACTIVITY_POLL_MS = 30_000;

export function recentActivityFromRead(
  read: ConsoleRead<ConsoleRecentActivity>,
): readonly ConsoleAuditEvent[] | null {
  return read.kind === "ok" ? read.value.events : null;
}

/**
 * Client poll scheduler for Home recent activity. Keeps the last good snapshot when a poll returns
 * `unavailable` or `denied`; only `ok` replaces the feed.
 */
export function createRecentActivityPoller(input: {
  readonly poll: () => Promise<ConsoleRead<ConsoleRecentActivity>>;
  readonly onUpdate: (events: readonly ConsoleAuditEvent[]) => void;
  readonly intervalMs?: number;
}): { readonly start: () => void; readonly stop: () => void } {
  const intervalMs = input.intervalMs ?? HOME_RECENT_ACTIVITY_POLL_MS;
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight = false;

  const tick = async () => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      const events = recentActivityFromRead(await input.poll());
      if (events !== null) {
        input.onUpdate(events);
      }
    } finally {
      inFlight = false;
    }
  };

  return {
    start: () => {
      if (timer !== undefined) {
        return;
      }
      timer = setInterval(() => {
        void tick();
      }, intervalMs);
    },
    stop: () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
