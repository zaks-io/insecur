import { Button } from "@insecur/ui";
import { useState } from "react";

const DISMISS_KEY = "insecur:approval-passkey-nudge-dismissed";

export function approvalPasskeyEnrollmentHref(returnTo: string): string {
  return `/auth/enroll-passkey?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Persistent console nudge until an approval passkey exists. Dismissible per browser session
 * (sessionStorage); reappears on the next visit until enrolled (docs/web-console-ux.md).
 */
export function ApprovalPasskeyNudge({
  enrolled,
  returnTo,
  enrollmentError = false,
}: {
  enrolled: boolean;
  returnTo: string;
  enrollmentError?: boolean;
}) {
  const [dismissed, setDismissed] = useState(() => readDismissedFromSession());

  if (enrolled || dismissed) {
    return null;
  }

  const dismiss = () => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(DISMISS_KEY, "1");
    }
    setDismissed(true);
  };

  return (
    <div
      className="border-b border-amber-600/40 bg-amber-50 px-5 py-3 text-sm sm:px-8"
      role="status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          {enrollmentError ? (
            <p className="text-destructive" role="alert">
              Passkey enrollment didn't complete. Try again or dismiss for now.
            </p>
          ) : null}
          <p>
            <span className="font-medium">Approval passkey not set up.</span> Enroll a passkey so
            your first production approval is one tap, not a ceremony under pressure.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild size="sm">
            <a href={approvalPasskeyEnrollmentHref(returnTo)}>Enroll passkey</a>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={dismiss}>
            Dismiss for now
          </Button>
        </div>
      </div>
    </div>
  );
}

export function resetApprovalPasskeyNudgeDismissalForTests(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.removeItem(DISMISS_KEY);
}

function readDismissedFromSession(): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }
  return sessionStorage.getItem(DISMISS_KEY) === "1";
}
