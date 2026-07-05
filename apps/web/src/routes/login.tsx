import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { beginBrowserLogin, redirectResponse } from "../auth/browser-oauth.js";
import type { WebEnv } from "../env.js";

export const Route = createFileRoute("/login")({
  server: {
    handlers: {
      GET: async () => {
        const request = getRequest();
        const started = await beginBrowserLogin(request, env as WebEnv);
        return redirectResponse(started.authorizationUrl, started.setCookieHeaders);
      },
    },
  },
  component: LoginPage,
});

function LoginPage() {
  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <p>Redirecting to WorkOS sign-in…</p>
    </section>
  );
}
