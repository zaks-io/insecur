import { Button } from "@insecur/ui";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  REJECT_APPROVAL_REQUEST_SUCCESS_VOICE,
  rejectApprovalRequestErrorVoice,
  type ApprovalActionVoice,
} from "../../console/approval-voice.js";
import { approvalInboxPath } from "../../console/approval-items.js";
import { csrfTokenFromCookieHeader } from "../../onboarding/csrf.js";
import { rejectOrgApprovalRequest } from "../../server/console-reject-approval-request.js";

function ActionMessage({ voice }: { voice: ApprovalActionVoice }) {
  return (
    <div className="px-4 py-4 sm:px-5" role="status">
      <p className="text-lg font-semibold tracking-tight leading-tight">{voice.headline}</p>
      <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
        {voice.detail}
      </p>
    </div>
  );
}

function RejectResultPanel({ orgId, voice }: { orgId: string; voice: ApprovalActionVoice }) {
  return (
    <section
      aria-labelledby="reject-approval-result-heading"
      className="rounded-xl border border-border bg-card"
    >
      <h2 id="reject-approval-result-heading" className="sr-only">
        Rejection result
      </h2>
      <ActionMessage voice={voice} />
      {voice.action === "back-to-inbox" ? (
        <div className="border-t border-border px-4 py-4 sm:px-5">
          <Button asChild variant="outline" size="sm">
            <a href={approvalInboxPath(orgId)}>Back to approvals</a>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ReasonField({
  pending,
  reason,
  onReasonChange,
}: {
  pending: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
}) {
  return (
    <label className="block max-w-prose">
      <span className="font-mono text-xs text-muted-foreground">Optional reason</span>
      <textarea
        className="mt-2 min-h-24 w-full resize-y border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
        value={reason}
        disabled={pending}
        maxLength={500}
        onChange={(event) => {
          onReasonChange(event.target.value);
        }}
        placeholder="Why you're rejecting this request"
      />
    </label>
  );
}

function RejectApprovalRequestForm({
  pending,
  reason,
  onReasonChange,
  onReject,
}: {
  pending: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onReject: () => void;
}) {
  return (
    <section
      aria-labelledby="reject-approval-heading"
      className="rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <h2
          id="reject-approval-heading"
          className="text-2xl font-semibold tracking-tight leading-tight"
        >
          Reject
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Deny this protected change. Approval requires passkey step-up separately.
        </p>
      </header>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <ReasonField pending={pending} reason={reason} onReasonChange={onReasonChange} />
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          className="w-full sm:w-auto motion-reduce:transition-none"
          onClick={onReject}
        >
          {pending ? "Rejecting…" : "Reject request"}
        </Button>
      </div>
    </section>
  );
}

/** One-click reject with optional reason for a pending Approval Request (INS-86). */
export function RejectApprovalRequestPanel({
  orgId,
  approvalRequestId,
}: {
  orgId: string;
  approvalRequestId: string;
}) {
  const rejectRequest = useServerFn(rejectOrgApprovalRequest);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [voice, setVoice] = useState<ApprovalActionVoice | null>(null);

  async function onReject() {
    setPending(true);
    setVoice(null);
    try {
      const outcome = await rejectRequest({
        data: {
          csrfToken: csrfTokenFromCookieHeader(document.cookie) ?? "",
          organizationId: orgId,
          approvalRequestId,
          ...(reason.trim() === "" ? {} : { reason: reason.trim() }),
        },
      });
      if (outcome.ok) {
        setVoice(REJECT_APPROVAL_REQUEST_SUCCESS_VOICE);
        return;
      }
      setVoice(rejectApprovalRequestErrorVoice(outcome.code));
    } finally {
      setPending(false);
    }
  }

  if (voice !== null) {
    return <RejectResultPanel orgId={orgId} voice={voice} />;
  }

  return (
    <RejectApprovalRequestForm
      pending={pending}
      reason={reason}
      onReasonChange={setReason}
      onReject={() => {
        void onReject();
      }}
    />
  );
}
