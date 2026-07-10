import { approvalInboxPath, type ConsoleApprovalItem } from "../console/approval-items.js";
import { ApprovalItem } from "./approval-item.js";

const STRIP_PREVIEW_LIMIT = 3;

function NeedsYouEmptyState() {
  return (
    <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">Nothing needs you.</p>
  );
}

function NeedsYouPreview({
  orgId,
  items,
}: {
  orgId: string;
  items: readonly ConsoleApprovalItem[];
}) {
  const preview = items.slice(0, STRIP_PREVIEW_LIMIT);
  const remaining = items.length - preview.length;

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {preview.map((item) => (
          <ApprovalItem key={item.id} item={item} orgId={orgId} />
        ))}
      </ul>
      <p className="font-mono text-xs text-muted-foreground">
        {remaining > 0
          ? `${String(remaining)} more pending in the inbox.`
          : "Open the inbox for the full list."}{" "}
        <a
          href={approvalInboxPath(orgId)}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          View approvals
        </a>
      </p>
    </div>
  );
}

/** Presentational Home strip for Home. Polling wrapper is `NeedsYouStrip`. */
export function NeedsYouStripContent({
  orgId,
  items,
}: {
  orgId: string;
  items: readonly ConsoleApprovalItem[];
}) {
  const countLabel = items.length === 1 ? "1 item" : `${String(items.length)} items`;

  return (
    <section aria-label="Needs you">
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 className="text-2xl font-semibold tracking-tight leading-tight">Needs you</h2>
        <p className="font-mono text-xs text-muted-foreground">{countLabel}</p>
      </div>
      <div className="mt-6">
        {items.length === 0 ? (
          <NeedsYouEmptyState />
        ) : (
          <NeedsYouPreview orgId={orgId} items={items} />
        )}
      </div>
    </section>
  );
}
