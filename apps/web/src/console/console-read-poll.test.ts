import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CONSOLE_READ_POLL_MS, createConsoleReadPoller } from "./console-read-poll.js";

describe("createConsoleReadPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes on the poll interval without replacing stale data on denied reads", async () => {
    const poll = vi
      .fn()
      .mockResolvedValueOnce({ kind: "ok", value: { count: 1 } })
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValueOnce({ kind: "ok", value: { count: 2 } });
    const updates: number[] = [];
    const poller = createConsoleReadPoller({
      poll,
      selectSnapshot: (read) =>
        read.kind === "ok" ? (read.value as { count: number }).count : null,
      onUpdate: (count) => {
        updates.push(count);
      },
      intervalMs: CONSOLE_READ_POLL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(CONSOLE_READ_POLL_MS);
    await vi.advanceTimersByTimeAsync(CONSOLE_READ_POLL_MS);
    await vi.advanceTimersByTimeAsync(CONSOLE_READ_POLL_MS);
    poller.stop();

    expect(poll).toHaveBeenCalledTimes(3);
    expect(updates).toEqual([1, 2]);
  });
});
