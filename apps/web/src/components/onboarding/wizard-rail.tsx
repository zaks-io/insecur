import { cn } from "@insecur/ui";
import {
  enabledOnboardingSteps,
  onboardingStepNumber,
  type OnboardingStepId,
} from "../../onboarding/steps.js";

/**
 * The wizard's table of contents: numbered because setup is a true sequence. Done steps are
 * struck through in ink, the current step carries the ink bar, and what's ahead stays muted.
 */
export function WizardRail({ currentStep }: { currentStep: OnboardingStepId }) {
  const steps = enabledOnboardingSteps();
  const currentNumber = onboardingStepNumber(currentStep);

  return (
    <>
      <nav aria-label="Setup steps" className="hidden sm:block">
        <ol className="flex flex-col border-t border-border">
          {steps.map((step) => {
            const number = onboardingStepNumber(step.id);
            const state =
              number < currentNumber ? "done" : number === currentNumber ? "current" : "ahead";
            return (
              <li
                key={step.id}
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex items-baseline gap-3 border-b border-border py-3 pr-4 pl-3 text-sm",
                  state === "current" && "border-l-4 border-l-primary pl-2 font-medium",
                  state === "ahead" && "text-muted-foreground",
                )}
              >
                <span className="font-mono text-xs tabular-nums" aria-hidden>
                  {number}
                </span>
                <span className={cn(state === "done" && "line-through decoration-2")}>
                  {step.railLabel}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
      <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase sm:hidden">
        Step {currentNumber} of {steps.length}
      </p>
    </>
  );
}
