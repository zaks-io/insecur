import { Badge } from "@insecur/ui";
import type {
  ConsoleApprovalItem,
  ConsoleApprovalRequestItem,
  ConsoleHighAssuranceChallengeItem,
} from "../console/approval-items.js";
import { approvalDetailPath } from "../console/approval-items.js";
import { shortDate } from "../console/projects.js";

function approvalItemKindLabel(kind: ConsoleApprovalItem["kind"]): string {
  return kind === "high_assurance_challenge" ? "High-Assurance Challenge" : "Approval Request";
}

function requesterLabel(item: ConsoleHighAssuranceChallengeItem): string {
  if (item.requestingMachineIdentityId !== null) {
    return item.requestingMachineIdentityId;
  }
  if (item.requestingUserId !== null) {
    return item.requestingUserId;
  }
  return "unknown requester";
}

function HighAssuranceChallengeDetails({ item }: { item: ConsoleHighAssuranceChallengeItem }) {
  return (
    <>
      <p className="mt-2 font-mono text-xs text-muted-foreground">{item.intentCode}</p>
      <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
        {item.projectId}
        {item.environmentId === null ? null : ` · ${item.environmentId}`}
      </p>
      <p className="mt-2 truncate font-mono text-xs text-muted-foreground">{item.riskReasonCode}</p>
      <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
        Requested by {requesterLabel(item)}
      </p>
      <p className="mt-2 font-mono text-xs text-muted-foreground">
        Expires {shortDate(item.expiresAt)}
      </p>
    </>
  );
}

function ApprovalRequestDetails({ item }: { item: ConsoleApprovalRequestItem }) {
  return (
    <p className="mt-2 font-mono text-xs text-muted-foreground">
      Pending approval request · {item.status}
    </p>
  );
}

/** Metadata-only inbox row for both Human Approval Surface item kinds (INS-377). */
export function ApprovalItem({ item, orgId }: { item: ConsoleApprovalItem; orgId?: string }) {
  const detailHref = orgId === undefined ? undefined : approvalDetailPath(orgId, item.id);

  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge>{approvalItemKindLabel(item.kind)}</Badge>
          {detailHref === undefined ? (
            <span className="truncate font-mono text-sm text-foreground">{item.id}</span>
          ) : (
            <a
              href={detailHref}
              className="truncate font-mono text-sm text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {item.id}
            </a>
          )}
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {shortDate(item.requestedAt)}
        </span>
      </div>
      {item.kind === "high_assurance_challenge" ? (
        <HighAssuranceChallengeDetails item={item} />
      ) : (
        <ApprovalRequestDetails item={item} />
      )}
    </li>
  );
}
