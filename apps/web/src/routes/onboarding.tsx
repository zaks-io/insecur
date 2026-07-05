import { Button } from "@insecur/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { SiteFrame } from "../components/site-frame.js";
import { loginRedirectHref } from "../console/login-redirect.js";
import { loadConsoleSession } from "../server/console-session.js";

/**
 * Placeholder the first-run onboarding wizard will claim (INS-374). Signed-in members with no
 * organization land here; members who already have one are sent back to their console.
 */
export const Route = createFileRoute("/onboarding")({
  loader: async () => {
    const session = await loadConsoleSession();
    if (!session.authenticated) {
      throw redirect({ href: loginRedirectHref("/onboarding") });
    }
    const first = session.organizations[0];
    if (first !== undefined) {
      throw redirect({ href: `/orgs/${first.organizationId}` });
    }
  },
  component: OnboardingPage,
});

function OnboardingPage() {
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
        <div className="max-w-xl border-2 border-ink px-6 py-6">
          <h1 className="font-display text-2xl leading-tight">Set up your organization</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            You're signed in, but you don't belong to an organization yet. The first-run setup
            wizard lands here: name your organization, enroll your approval passkey, and create your
            first project.
          </p>
        </div>
      </section>
    </SiteFrame>
  );
}
