import type { ConsoleRead } from "../server/console-read.js";
import type { ConsoleApprovalItem, ConsolePendingApprovals } from "./approval-items.js";
import { CONSOLE_READ_POLL_MS, createConsoleReadPoller } from "./console-read-poll.js";

export const HOME_PENDING_APPROVALS_POLL_MS = CONSOLE_READ_POLL_MS;

export function pendingApprovalsFromRead(
  read: ConsoleRead<ConsolePendingApprovals>,
): readonly ConsoleApprovalItem[] | null {
  return read.kind === "ok" ? read.value.items : null;
}

/** Client poll scheduler for pending approvals. */
export function createPendingApprovalsPoller(input: {
  readonly poll: () => Promise<ConsoleRead<ConsolePendingApprovals>>;
  readonly onUpdate: (items: readonly ConsoleApprovalItem[]) => void;
  readonly intervalMs?: number;
}): { readonly start: () => void; readonly stop: () => void } {
  return createConsoleReadPoller({
    poll: input.poll,
    selectSnapshot: (read) =>
      pendingApprovalsFromRead(read as ConsoleRead<ConsolePendingApprovals>),
    onUpdate: input.onUpdate,
    ...(input.intervalMs === undefined ? {} : { intervalMs: input.intervalMs }),
  });
}
