import { Badge } from "@insecur/ui";
import type { ReactNode } from "react";
import type { ConsoleApprovalRequestDetail } from "../../console/approval-request-detail-parse.js";
import { shortDate } from "../../console/projects.js";
import { ActorChain } from "../actor-chain.js";

function EvidenceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-ink/20 px-4 py-3 sm:grid-cols-[minmax(0,9rem)_1fr] sm:gap-4">
      <dt className="font-mono text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-mono text-sm text-foreground">{children}</dd>
    </div>
  );
}

function StalenessBanner() {
  return (
    <div className="border-b-2 border-ink bg-destructive/5 px-4 py-4 sm:px-5" role="status">
      <p className="font-display text-lg leading-tight">Impact review is stale</p>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
        Protected delivery facts changed since this request was staged. The requester must submit a
        fresh Approval Request before you can approve.
      </p>
    </div>
  );
}

function DraftVersionsSection({
  draftVersions,
}: {
  draftVersions: ConsoleApprovalRequestDetail["impactReview"]["draftVersions"];
}) {
  if (draftVersions.length === 0) {
    return (
      <p className="px-4 py-3 font-mono text-xs text-muted-foreground sm:px-5">
        No draft versions in this change set.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-ink/20">
      {draftVersions.map((draft) => (
        <li key={draft.secretVersionId} className="px-4 py-3 sm:px-5">
          <p className="font-mono text-sm">{draft.secretId}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {draft.secretVersionId} · {draft.valueByteLength} bytes · {draft.encodingClass} ·{" "}
            {draft.secretShapeMatchVerdict}
          </p>
        </li>
      ))}
    </ul>
  );
}

function DeliveryImpactSection({
  delivery,
}: {
  delivery: ConsoleApprovalRequestDetail["impactReview"]["delivery"];
}) {
  return (
    <div className="border-t-2 border-ink">
      <h3 className="px-4 py-3 font-display text-lg sm:px-5">Delivery impact</h3>
      {delivery.runtimeInjectionPolicies.length === 0 ? (
        <p className="px-4 pb-4 font-mono text-xs text-muted-foreground sm:px-5">
          No runtime injection policies affected.
        </p>
      ) : (
        <ul className="divide-y divide-ink/20">
          {delivery.runtimeInjectionPolicies.map((policy) => (
            <li key={policy.policyId} className="px-4 py-3 sm:px-5">
              <p className="font-mono text-sm">{policy.policyId}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {policy.deliveryMode} · TTL {policy.ttlSeconds}s · {policy.secretIds.length}{" "}
                secret(s)
              </p>
            </li>
          ))}
        </ul>
      )}
      {delivery.providerSyncImpact.length > 0 ? (
        <p className="border-t border-ink/20 px-4 py-3 font-mono text-xs text-muted-foreground sm:px-5">
          Provider sync: {delivery.providerSyncImpact.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function RequestMetadataSection({ request }: { request: ConsoleApprovalRequestDetail }) {
  return (
    <dl>
      <EvidenceRow label="Request">{request.id}</EvidenceRow>
      <EvidenceRow label="Project">{request.projectId}</EvidenceRow>
      <EvidenceRow label="Environment">{request.environmentId}</EvidenceRow>
      {request.operationId === null ? null : (
        <EvidenceRow label="Operation">{request.operationId}</EvidenceRow>
      )}
      <EvidenceRow label="Requested by">
        <ActorChain
          requestingUserId={request.requestingUserId}
          requestingMachineIdentityId={request.requestingMachineIdentityId}
        />
      </EvidenceRow>
      <EvidenceRow label="Requested">{shortDate(request.requestedAt)}</EvidenceRow>
      {request.commentLength === null ? null : (
        <EvidenceRow label="Comment length">{request.commentLength}</EvidenceRow>
      )}
    </dl>
  );
}

/** Metadata evidence panel for one Approval Request (INS-86). */
export function ApprovalRequestEvidencePanel({
  request,
}: {
  request: ConsoleApprovalRequestDetail;
}) {
  const { impactReview } = request;

  return (
    <section aria-labelledby="approval-request-evidence-heading" className="border-2 border-ink">
      <header className="border-b-2 border-ink px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="approval-request-evidence-heading"
            className="font-display text-2xl leading-tight"
          >
            Evidence
          </h2>
          <Badge>Approval Request</Badge>
          <Badge variant="outline">{request.purpose}</Badge>
          <Badge variant="outline">{request.status}</Badge>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Metadata-only impact review. Secret values and plaintext diffs never appear here.
        </p>
      </header>

      {impactReview.isStale ? <StalenessBanner /> : null}

      <RequestMetadataSection request={request} />

      <div className="border-t-2 border-ink">
        <h3 className="px-4 py-3 font-display text-lg sm:px-5">Promotion change set</h3>
        <DraftVersionsSection draftVersions={impactReview.draftVersions} />
      </div>

      <DeliveryImpactSection delivery={impactReview.delivery} />
    </section>
  );
}
