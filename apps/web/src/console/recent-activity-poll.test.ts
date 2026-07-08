import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ConsoleAuditEvent } from "../console/audit-events.js";
import {
  createRecentActivityPoller,
  HOME_RECENT_ACTIVITY_POLL_MS,
  recentActivityFromRead,
} from "../console/recent-activity-poll.js";

const EVENT: ConsoleAuditEvent = {
  auditEventId: "aud_01JZ8E2QYQ6M7F4K9A2B3C4D5E",
  eventCode: "secret.non_protected_write",
  outcome: "success",
  actor: { actorType: "user", userId: "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E" },
  projectId: null,
  environmentId: null,
  resource: null,
  details: null,
  createdAt: "2026-07-01T00:00:00.000Z",
};

describe("recentActivityFromRead", () => {
  it("returns events only for ok reads", () => {
    expect(
      recentActivityFromRead({
        kind: "ok",
        value: { events: [EVENT], nextCursor: null },
      }),
    ).toEqual([EVENT]);
    expect(recentActivityFromRead({ kind: "denied" })).toBeNull();
    expect(recentActivityFromRead({ kind: "unavailable" })).toBeNull();
  });
});

describe("createRecentActivityPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes the feed on the poll interval without replacing stale data on unavailable reads", async () => {
    const poll = vi
      .fn()
      .mockResolvedValueOnce({ kind: "ok", value: { events: [EVENT], nextCursor: null } })
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValueOnce({
        kind: "ok",
        value: {
          events: [{ ...EVENT, auditEventId: "aud_01JZ8E2QYQ7M7F4K9A2B3C4D5E" }],
          nextCursor: null,
        },
      });
    const updates: ConsoleAuditEvent[][] = [];
    const poller = createRecentActivityPoller({
      poll,
      onUpdate: (events) => {
        updates.push([...events]);
      },
      intervalMs: HOME_RECENT_ACTIVITY_POLL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(HOME_RECENT_ACTIVITY_POLL_MS);
    await vi.advanceTimersByTimeAsync(HOME_RECENT_ACTIVITY_POLL_MS);
    await vi.advanceTimersByTimeAsync(HOME_RECENT_ACTIVITY_POLL_MS);
    poller.stop();

    expect(poll).toHaveBeenCalledTimes(3);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual([EVENT]);
    expect(updates[1]).toEqual([{ ...EVENT, auditEventId: "aud_01JZ8E2QYQ7M7F4K9A2B3C4D5E" }]);
  });
});
