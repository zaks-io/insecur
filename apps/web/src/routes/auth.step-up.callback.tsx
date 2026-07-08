import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { completeBrowserChallengeClearStepUp } from "../auth/browser-challenge-clear-step-up.js";
import { formatPkceStateClearCookie } from "../auth/browser-oauth-pkce.js";
import { redirectResponse } from "../auth/browser-oauth.js";
import { SiteFrame } from "../components/site-frame.js";
import { asWebEnv } from "../env.js";

export const Route = createFileRoute("/auth/step-up/callback")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const completed = await completeBrowserChallengeClearStepUp(request, asWebEnv(env));
        if (!completed.ok) {
          return redirectResponse(completed.redirectTo, [formatPkceStateClearCookie()]);
        }
        return redirectResponse(completed.value.redirectTo, completed.value.setCookieHeaders);
      },
    },
  },
  component: StepUpCallbackPage,
});

function StepUpCallbackPage() {
  return (
    <SiteFrame>
      <section className="px-5 py-10 sm:px-8 sm:py-12">
        <p>Completing approval step-up…</p>
      </section>
    </SiteFrame>
  );
}
