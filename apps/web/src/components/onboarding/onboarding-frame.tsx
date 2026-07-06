import { Button } from "@insecur/ui";
import type { ReactNode } from "react";
import { WizardRail } from "./wizard-rail.js";
import { SiteFrame } from "../site-frame.js";
import type { OnboardingStepId } from "../../onboarding/steps.js";

/** The wizard's page chrome: editorial site header, eyebrow title, step rail beside the panel. */
export function OnboardingFrame({
  currentStep,
  children,
}: {
  currentStep: OnboardingStepId;
  children: ReactNode;
}) {
  return (
    <SiteFrame
      nav={
        <form method="post" action="/logout">
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      }
    >
      <section className="px-5 py-10 sm:px-8 sm:py-12">
        <div className="max-w-4xl">
          <h1 className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            First-run setup
          </h1>
          <div className="mt-5 grid items-start gap-6 sm:grid-cols-[200px_minmax(0,1fr)]">
            <WizardRail currentStep={currentStep} />
            {children}
          </div>
        </div>
      </section>
    </SiteFrame>
  );
}
