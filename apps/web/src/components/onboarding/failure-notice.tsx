import { Button } from "@insecur/ui";
import type { WizardErrorVoice } from "../../onboarding/wizard-voice.js";

/** A provisioning failure, spoken in the interface's voice with its one concrete next move. */
export function FailureNotice({
  failure,
  onContinueToHandoff,
}: {
  failure: WizardErrorVoice;
  onContinueToHandoff: () => void;
}) {
  return (
    <div role="alert" className="max-w-prose border-2 border-destructive px-4 py-3">
      <p className="text-sm font-medium text-destructive">{failure.headline}</p>
      <p className="mt-1 text-sm leading-relaxed">{failure.detail}</p>
      {failure.action === "sign-in" ? (
        <Button asChild variant="outline" size="sm" className="mt-3">
          <a href="/login?returnTo=%2Fonboarding">Sign in again</a>
        </Button>
      ) : failure.action === "continue-to-handoff" ? (
        <Button type="button" size="sm" className="mt-3" onClick={onContinueToHandoff}>
          Continue to CLI handoff
        </Button>
      ) : null}
    </div>
  );
}
