import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { ConsoleApprovalItem } from "../console/approval-items.js";
import {
  createPendingApprovalsPoller,
  HOME_PENDING_APPROVALS_POLL_MS,
} from "../console/pending-approvals-poll.js";
import { loadOrgPendingApprovals } from "../server/console-pending-approvals.js";
import { ApprovalsInboxContent } from "./pending-approvals-inbox-content.js";

/**
 * Full approvals inbox (INS-377): SSR loader seeds pending approvals; client polling refreshes
 * without navigation (ADR-0051).
 */
export function PendingApprovalsInbox({
  orgId,
  initialItems,
}: {
  orgId: string;
  initialItems: readonly ConsoleApprovalItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const loadPendingApprovals = useServerFn(loadOrgPendingApprovals);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const poller = createPendingApprovalsPoller({
      poll: () => loadPendingApprovals({ data: { organizationId: orgId } }),
      onUpdate: setItems,
      intervalMs: HOME_PENDING_APPROVALS_POLL_MS,
    });
    poller.start();
    return () => {
      poller.stop();
    };
  }, [loadPendingApprovals, orgId]);

  return <ApprovalsInboxContent orgId={orgId} items={items} />;
}
