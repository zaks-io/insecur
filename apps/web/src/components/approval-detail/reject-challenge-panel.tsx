import { Button } from "@insecur/ui";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  REJECT_CHALLENGE_SUCCESS_VOICE,
  rejectChallengeErrorVoice,
  type ApprovalActionVoice,
} from "../../console/approval-voice.js";
import { approvalInboxPath } from "../../console/approval-items.js";
import { csrfTokenFromCookieHeader } from "../../onboarding/csrf.js";
import { rejectOrgHighAssuranceChallenge } from "../../server/console-reject-challenge.js";

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

function RejectResultPanel({ orgId, voice }: { orgId: string; voice: ApprovalActionVoice }) {
  return (
    <section aria-labelledby="reject-result-heading" className="border-2 border-ink">
      <h2 id="reject-result-heading" className="sr-only">
        Rejection result
      </h2>
      <ActionMessage voice={voice} />
      {voice.action === "back-to-inbox" ? (
        <div className="border-t-2 border-ink px-4 py-4 sm:px-5">
          <Button asChild variant="outline" size="sm">
            <a href={approvalInboxPath(orgId)}>Back to approvals</a>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function RejectChallengeForm({
  disabled,
  pending,
  reason,
  onReasonChange,
  onReject,
}: {
  disabled: boolean;
  pending: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onReject: () => void;
}) {
  return (
    <section aria-labelledby="reject-heading" className="border-2 border-ink">
      <header className="border-b-2 border-ink px-4 py-4 sm:px-5">
        <h2 id="reject-heading" className="font-display text-2xl leading-tight">
          Reject
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Deny the bounded operation. Approval with passkey step-up lands in the next slice.
        </p>
      </header>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <label className="block max-w-prose">
          <span className="font-mono text-xs text-muted-foreground">Optional reason</span>
          <textarea
            className="mt-2 min-h-24 w-full resize-y border-2 border-ink bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none"
            value={reason}
            disabled={disabled || pending}
            maxLength={500}
            onChange={(event) => {
              onReasonChange(event.target.value);
            }}
            placeholder="Why you're rejecting this challenge"
          />
        </label>
        <Button
          type="button"
          variant="destructive"
          disabled={disabled || pending}
          className="w-full sm:w-auto motion-reduce:transition-none"
          onClick={onReject}
        >
          {pending ? "Rejecting…" : "Reject challenge"}
        </Button>
      </div>
    </section>
  );
}

/** One-click reject with optional reason for a pending High-Assurance Challenge (INS-381). */
export function RejectChallengePanel({
  orgId,
  operationId,
  disabled,
}: {
  orgId: string;
  operationId: string;
  disabled: boolean;
}) {
  const rejectChallenge = useServerFn(rejectOrgHighAssuranceChallenge);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [voice, setVoice] = useState<ApprovalActionVoice | null>(null);

  async function onReject() {
    setPending(true);
    setVoice(null);
    try {
      const outcome = await rejectChallenge({
        data: {
          csrfToken: csrfTokenFromCookieHeader(document.cookie) ?? "",
          organizationId: orgId,
          operationId,
          ...(reason.trim() === "" ? {} : { reason: reason.trim() }),
        },
      });
      if (outcome.ok) {
        setVoice(REJECT_CHALLENGE_SUCCESS_VOICE);
        return;
      }
      setVoice(rejectChallengeErrorVoice(outcome.code));
    } finally {
      setPending(false);
    }
  }

  if (voice !== null) {
    return <RejectResultPanel orgId={orgId} voice={voice} />;
  }

  return (
    <RejectChallengeForm
      disabled={disabled}
      pending={pending}
      reason={reason}
      onReasonChange={setReason}
      onReject={() => {
        void onReject();
      }}
    />
  );
}
