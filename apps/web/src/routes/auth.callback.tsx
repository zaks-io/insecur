import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { completeBrowserLogin, redirectResponse } from "../auth/browser-oauth.js";
import { formatPkceStateClearCookie } from "../auth/browser-oauth-pkce.js";
import type { WebEnv } from "../env.js";

export const Route = createFileRoute("/auth/callback")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const completed = await completeBrowserLogin(request, env as WebEnv);
        if (!completed.ok) {
          return redirectResponse("/login", [formatPkceStateClearCookie()]);
        }
        return redirectResponse(completed.value.redirectTo, completed.value.setCookieHeaders);
      },
    },
  },
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <p>Completing sign-in…</p>
    </section>
  );
}
