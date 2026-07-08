import { Button } from "@insecur/ui";
import { getRouteApi } from "@tanstack/react-router";
import { challengeClearStepUpHref } from "../../auth/browser-challenge-clear-step-up-public.js";
import { approvalPasskeyEnrollmentHref } from "../approval-passkey-nudge.js";
import type { ApprovalActionVoice } from "../../console/approval-voice.js";
import { approvalInboxPath } from "../../console/approval-items.js";
import { approvalVoiceFromDetailSearch } from "../../console/approval-detail-approve-voice.js";
import type { ConsoleHighAssuranceChallengeDetail } from "../../console/approval-detail-parse.js";

const approvalDetailRoute = getRouteApi("/orgs/$orgId/approvals_/$id");

function ActionMessage({ voice }: { voice: ApprovalActionVoice }) {
  return (
    <div className="border-2 border-ink px-4 py-4 sm:px-5" role="status">
      <p className="font-display text-lg leading-tight">{voice.headline}</p>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
        {voice.detail}
      </p>
    </div>
  );
}

function ApproveResultPanel({
  orgId,
  voice,
  enrollmentHref,
}: {
  orgId: string;
  voice: ApprovalActionVoice;
  enrollmentHref: string;
}) {
  return (
    <section aria-labelledby="approve-result-heading" className="border-2 border-ink">
      <h2 id="approve-result-heading" className="sr-only">
        Approval result
      </h2>
      <ActionMessage voice={voice} />
      <div className="flex flex-wrap gap-2 border-t-2 border-ink px-4 py-4 sm:px-5">
        {voice.action === "back-to-inbox" ? (
          <Button asChild variant="outline" size="sm">
            <a href={approvalInboxPath(orgId)}>Back to approvals</a>
          </Button>
        ) : null}
        {voice.action === "enroll-passkey" ? (
          <Button asChild size="sm">
            <a href={enrollmentHref}>Enroll passkey</a>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function ApproveActionButton({
  disabled,
  href,
  label,
}: {
  disabled: boolean;
  href: string;
  label: string;
}) {
  if (disabled) {
    return (
      <Button disabled className="w-full sm:w-auto motion-reduce:transition-none">
        {label}
      </Button>
    );
  }
  return (
    <Button asChild className="w-full sm:w-auto motion-reduce:transition-none">
      <a href={href}>{label}</a>
    </Button>
  );
}

function ApproveChallengeForm({
  disabled,
  enrolled,
  stepUpHref,
  enrollmentHref,
}: {
  disabled: boolean;
  enrolled: boolean;
  stepUpHref: string;
  enrollmentHref: string;
}) {
  return (
    <section aria-labelledby="approve-heading" className="border-2 border-ink">
      <header className="border-b-2 border-ink px-4 py-4 sm:px-5">
        <h2 id="approve-heading" className="font-display text-2xl leading-tight">
          Approve
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Clear the bounded operation with a fresh passkey or authenticator step-up. The staging CLI
          unblocks automatically once cleared.
        </p>
      </header>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {!enrolled ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground" role="status">
            Enroll an approval passkey before your first clear. Step-up cannot run without an
            enrolled factor.
          </p>
        ) : null}
        {enrolled ? (
          <ApproveActionButton
            disabled={disabled}
            href={stepUpHref}
            label="Approve with passkey step-up"
          />
        ) : (
          <ApproveActionButton
            disabled={disabled}
            href={enrollmentHref}
            label="Enroll passkey to approve"
          />
        )}
      </div>
    </section>
  );
}

/** WorkOS step-up approve path for a pending High-Assurance Challenge (INS-383). */
export function ApproveChallengePanel({
  orgId,
  challenge,
  passkeyEnrolled,
  disabled,
}: {
  orgId: string;
  challenge: ConsoleHighAssuranceChallengeDetail;
  passkeyEnrolled: boolean;
  disabled: boolean;
}) {
  const search = approvalDetailRoute.useSearch();
  const detailPath = approvalDetailRoute.useMatch().pathname;
  const enrollmentHref = approvalPasskeyEnrollmentHref(detailPath);
  const stepUpHref = challengeClearStepUpHref({
    returnTo: detailPath,
    organizationId: orgId,
    operationId: challenge.id,
    projectId: challenge.projectId,
    ...(typeof challenge.environmentId === "string"
      ? { environmentId: challenge.environmentId }
      : {}),
  });
  const resultVoice = approvalVoiceFromDetailSearch(search, challenge.id);
  if (resultVoice !== null) {
    return <ApproveResultPanel orgId={orgId} enrollmentHref={enrollmentHref} voice={resultVoice} />;
  }

  return (
    <ApproveChallengeForm
      disabled={disabled}
      enrolled={passkeyEnrolled}
      stepUpHref={stepUpHref}
      enrollmentHref={enrollmentHref}
    />
  );
}
