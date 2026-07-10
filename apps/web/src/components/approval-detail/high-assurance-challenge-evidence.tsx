import { Badge } from "@insecur/ui";
import type { ReactNode } from "react";
import type { ConsoleHighAssuranceChallengeDetail } from "../../console/approval-detail-parse.js";
import {
  approvalStalenessNotice,
  type ApprovalStalenessNotice,
} from "../../console/approval-staleness.js";
import { shortDate } from "../../console/projects.js";
import { ActorChain } from "../actor-chain.js";

function EvidenceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border px-4 py-3 sm:grid-cols-[minmax(0,9rem)_1fr] sm:gap-4">
      <dt className="font-mono text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-mono text-sm text-foreground">{children}</dd>
    </div>
  );
}

function StalenessBanner({ staleness }: { staleness: ApprovalStalenessNotice }) {
  return (
    <div
      className={`border-b border-border px-4 py-4 sm:px-5 ${
        staleness.tone === "warning" ? "bg-destructive/5" : "bg-muted"
      }`}
      role="status"
    >
      <p className="text-lg font-semibold tracking-tight leading-tight">{staleness.headline}</p>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
        {staleness.detail}
      </p>
    </div>
  );
}

function ChallengeEvidenceFields({
  challenge,
}: {
  challenge: ConsoleHighAssuranceChallengeDetail;
}) {
  return (
    <dl>
      <EvidenceRow label="Operation">{challenge.id}</EvidenceRow>
      <EvidenceRow label="Challenge">{challenge.challengeId}</EvidenceRow>
      <EvidenceRow label="Intent">{challenge.intentCode}</EvidenceRow>
      <EvidenceRow label="Risk">{challenge.riskReasonCode}</EvidenceRow>
      <EvidenceRow label="Project">{challenge.projectId}</EvidenceRow>
      <EvidenceRow label="Environment">{challenge.environmentId ?? "—"}</EvidenceRow>
      <EvidenceRow label="Staged by">
        <ActorChain
          requestingUserId={challenge.requestingUserId}
          requestingMachineIdentityId={challenge.requestingMachineIdentityId}
        />
      </EvidenceRow>
      <EvidenceRow label="Requested">{shortDate(challenge.requestedAt)}</EvidenceRow>
      <EvidenceRow label="Expires">{shortDate(challenge.expiresAt)}</EvidenceRow>
    </dl>
  );
}

/** Metadata evidence panel for one High-Assurance Challenge (INS-381). */
export function HighAssuranceChallengeEvidencePanel({
  challenge,
}: {
  challenge: ConsoleHighAssuranceChallengeDetail;
}) {
  const staleness = approvalStalenessNotice(challenge);

  return (
    <section
      aria-labelledby="approval-evidence-heading"
      className="rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="approval-evidence-heading"
            className="text-2xl font-semibold tracking-tight leading-tight"
          >
            Evidence
          </h2>
          <Badge>High-Assurance Challenge</Badge>
          <Badge variant={challenge.status === "pending" ? "outline" : "solid"}>
            {challenge.status}
          </Badge>
        </div>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Metadata only. Secret values and approval authority never travel through deep links.
        </p>
      </header>

      {staleness === null ? null : <StalenessBanner staleness={staleness} />}

      <ChallengeEvidenceFields challenge={challenge} />
    </section>
  );
}
