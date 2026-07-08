import type { ConsoleRead } from "../server/console-read.js";

/** Modest client poll interval for console metadata reads (ADR-0051: V1 uses polling, not SSE). */
export const CONSOLE_READ_POLL_MS = 30_000;

/**
 * Client poll scheduler for authed console metadata reads. Keeps the last good snapshot when a poll
 * returns `unavailable` or `denied`; only `ok` replaces the rendered data.
 */
export function createConsoleReadPoller<TSnapshot>(input: {
  readonly poll: () => Promise<ConsoleRead<unknown>>;
  readonly selectSnapshot: (read: ConsoleRead<unknown>) => TSnapshot | null;
  readonly onUpdate: (snapshot: TSnapshot) => void;
  readonly intervalMs?: number;
}): { readonly start: () => void; readonly stop: () => void } {
  const intervalMs = input.intervalMs ?? CONSOLE_READ_POLL_MS;
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight = false;

  const tick = async () => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      const snapshot = input.selectSnapshot(await input.poll());
      if (snapshot !== null) {
        input.onUpdate(snapshot);
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
