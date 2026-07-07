import { Button } from "@insecur/ui";
import { StepPanel } from "./step-panel.js";

/** Step 2: invite approval passkey enrollment via AuthKit redirect; skippable (INS-378). */
export function EnrollPasskeyStep({
  returnTo,
  enrollmentError,
  onSkip,
  onEnrolled,
}: {
  returnTo: string;
  enrollmentError: boolean;
  onSkip: () => void;
  onEnrolled?: () => void;
}) {
  const enrollHref = `/auth/enroll-passkey?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <StepPanel
      title="Set up your approval passkey"
      intro="This passkey approves production changes. When something needs your sign-off, you'll tap once instead of enrolling under pressure."
    >
      <div className="mt-6 flex flex-col gap-5">
        {enrollmentError ? (
          <p className="text-sm text-destructive" role="alert">
            Passkey enrollment didn't complete. Try again or skip for now — you can enroll later
            from the console banner.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href={enrollHref}>Enroll passkey</a>
          </Button>
          <Button type="button" variant="outline" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
        {onEnrolled !== undefined ? (
          <p className="text-sm text-muted-foreground">
            Already enrolled?{" "}
            <button type="button" className="underline underline-offset-2" onClick={onEnrolled}>
              Continue
            </button>
          </p>
        ) : null}
      </div>
    </StepPanel>
  );
}
