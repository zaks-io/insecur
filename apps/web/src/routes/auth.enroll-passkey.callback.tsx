import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import {
  completeBrowserPasskeyEnrollment,
  resolveEnrollmentFailureRedirect,
} from "../auth/browser-passkey-enrollment.js";
import { formatPkceStateClearCookie } from "../auth/browser-oauth-pkce.js";
import { redirectResponse } from "../auth/browser-oauth.js";
import { SiteFrame } from "../components/site-frame.js";
import type { WebEnv } from "../env.js";

export const Route = createFileRoute("/auth/enroll-passkey/callback")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const completed = await completeBrowserPasskeyEnrollment(request, env as WebEnv);
        if (!completed.ok) {
          return redirectResponse(resolveEnrollmentFailureRedirect(request), [
            formatPkceStateClearCookie(),
          ]);
        }
        return redirectResponse(completed.value.redirectTo, completed.value.setCookieHeaders);
      },
    },
  },
  component: EnrollPasskeyCallbackPage,
});

function EnrollPasskeyCallbackPage() {
  return (
    <SiteFrame>
      <section className="px-5 py-10 sm:px-8 sm:py-12">
        <p>Completing passkey enrollment…</p>
      </section>
    </SiteFrame>
  );
}
