import { Button } from "@insecur/ui";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  CANCEL_APPROVAL_REQUEST_SUCCESS_VOICE,
  cancelApprovalRequestErrorVoice,
  type ApprovalActionVoice,
} from "../../console/approval-voice.js";
import { approvalInboxPath } from "../../console/approval-items.js";
import { csrfTokenFromCookieHeader } from "../../onboarding/csrf.js";
import { cancelOrgApprovalRequest } from "../../server/console-cancel-approval-request.js";

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

function CancelApprovalRequestForm({
  pending,
  onCancel,
}: {
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <section
      aria-labelledby="cancel-approval-heading"
      className="rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <h2
          id="cancel-approval-heading"
          className="text-2xl font-semibold tracking-tight leading-tight"
        >
          Cancel
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Withdraw this pending request when you staged it or have membership cleanup access.
        </p>
      </header>
      <div className="px-4 py-4 sm:px-5">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="w-full sm:w-auto motion-reduce:transition-none"
          onClick={onCancel}
        >
          {pending ? "Canceling…" : "Cancel request"}
        </Button>
      </div>
    </section>
  );
}

function CancelResultPanel({ orgId, voice }: { orgId: string; voice: ApprovalActionVoice }) {
  return (
    <section
      aria-labelledby="cancel-approval-result-heading"
      className="rounded-xl border border-border bg-card"
    >
      <h2 id="cancel-approval-result-heading" className="sr-only">
        Cancellation result
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

/** Cancel a pending Approval Request when the actor is the requester or has membership manage. */
export function CancelApprovalRequestPanel({
  orgId,
  approvalRequestId,
}: {
  orgId: string;
  approvalRequestId: string;
}) {
  const cancelRequest = useServerFn(cancelOrgApprovalRequest);
  const [pending, setPending] = useState(false);
  const [voice, setVoice] = useState<ApprovalActionVoice | null>(null);

  async function onCancel() {
    setPending(true);
    setVoice(null);
    try {
      const outcome = await cancelRequest({
        data: {
          csrfToken: csrfTokenFromCookieHeader(document.cookie) ?? "",
          organizationId: orgId,
          approvalRequestId,
        },
      });
      if (outcome.ok) {
        setVoice(CANCEL_APPROVAL_REQUEST_SUCCESS_VOICE);
        return;
      }
      setVoice(cancelApprovalRequestErrorVoice(outcome.code));
    } finally {
      setPending(false);
    }
  }

  if (voice !== null) {
    return <CancelResultPanel orgId={orgId} voice={voice} />;
  }

  return (
    <CancelApprovalRequestForm
      pending={pending}
      onCancel={() => {
        void onCancel();
      }}
    />
  );
}
