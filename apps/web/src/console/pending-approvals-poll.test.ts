import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ConsoleApprovalItem } from "../console/approval-items.js";
import {
  createPendingApprovalsPoller,
  HOME_PENDING_APPROVALS_POLL_MS,
  pendingApprovalsFromRead,
} from "../console/pending-approvals-poll.js";

const ITEM: ConsoleApprovalItem = {
  kind: "high_assurance_challenge",
  id: "op_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  intentCode: "sync.run",
  projectId: "prj_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  environmentId: null,
  riskReasonCode: "high_assurance.risk.agent_step_up",
  requestedAt: "2026-07-01T00:00:00.000Z",
  expiresAt: "2026-07-01T01:00:00.000Z",
  requestingMachineIdentityId: "mach_01JZ8E2QYQAAAAAAAAAAAAAAAA",
  requestingUserId: null,
};

describe("pendingApprovalsFromRead", () => {
  it("returns items only for ok reads", () => {
    expect(pendingApprovalsFromRead({ kind: "ok", value: { items: [ITEM] } })).toEqual([ITEM]);
    expect(pendingApprovalsFromRead({ kind: "denied" })).toBeNull();
    expect(pendingApprovalsFromRead({ kind: "unavailable" })).toBeNull();
  });
});

describe("createPendingApprovalsPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes the inbox on the poll interval without replacing stale data on unavailable reads", async () => {
    const poll = vi
      .fn()
      .mockResolvedValueOnce({ kind: "ok", value: { items: [ITEM] } })
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockResolvedValueOnce({
        kind: "ok",
        value: {
          items: [{ ...ITEM, id: "op_01JZ8E2QYQ7M7F4K9A2B3C4D5E" }],
        },
      });
    const updates: ConsoleApprovalItem[][] = [];
    const poller = createPendingApprovalsPoller({
      poll,
      onUpdate: (items) => {
        updates.push([...items]);
      },
      intervalMs: HOME_PENDING_APPROVALS_POLL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(HOME_PENDING_APPROVALS_POLL_MS);
    await vi.advanceTimersByTimeAsync(HOME_PENDING_APPROVALS_POLL_MS);
    await vi.advanceTimersByTimeAsync(HOME_PENDING_APPROVALS_POLL_MS);
    poller.stop();

    expect(poll).toHaveBeenCalledTimes(3);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual([ITEM]);
    expect(updates[1]).toEqual([{ ...ITEM, id: "op_01JZ8E2QYQ7M7F4K9A2B3C4D5E" }]);
  });
});
