import type { ConsoleApprovalItem } from "../console/approval-items.js";
import { ApprovalItem } from "./approval-item.js";

function ApprovalsInboxEmptyState() {
  return (
    <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
      Nothing needs you. Pending High-Assurance Challenges and Approval Requests will appear here
      when they need a human decision. Secret values and approval actions never render in this
      inbox.
    </p>
  );
}

/** Presentational approvals inbox. Polling wrapper is `PendingApprovalsInbox`. */
export function ApprovalsInboxContent({
  orgId,
  items,
}: {
  orgId: string;
  items: readonly ConsoleApprovalItem[];
}) {
  const countLabel = items.length === 1 ? "1 pending item" : `${String(items.length)} pending`;

  return (
    <>
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 className="text-2xl font-semibold tracking-tight leading-tight">Pending approvals</h2>
        <p className="font-mono text-xs text-muted-foreground">{countLabel}</p>
      </div>
      {items.length === 0 ? (
        <div className="mt-8">
          <ApprovalsInboxEmptyState />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {items.map((item) => (
            <ApprovalItem key={item.id} item={item} orgId={orgId} />
          ))}
        </ul>
      )}
    </>
  );
}
