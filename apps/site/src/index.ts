import * as Sentry from "@sentry/cloudflare";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import serverEntry from "@tanstack/react-start/server-entry";
import type { SiteEnv } from "./env.js";
import { sentryBrowserConfig, sentryOptions } from "./sentry.js";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Placeholder site: keep it out of search indexes until launch (belt-and-suspenders with the
  // per-page robots meta). Remove when the public site goes live.
  "X-Robots-Tag": "noindex, nofollow",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

type ServerEntryOptions = Parameters<typeof serverEntry.fetch>[1];

const sentryServerEntry = wrapFetchWithSentry({
  fetch(request, opts) {
    return serverEntry.fetch(request, opts as ServerEntryOptions);
  },
});

/**
 * Public Site Worker entry (ADR-0078). Serves the marketing/legal/security surface for
 * insecur.cloud. It holds no auth session, no database/keyring binding, and no API/Runtime Service
 * Binding; `env` carries no control-plane capability. A plain fetch handler (not a Hono router) so
 * the deploy-topology gate extracts zero public route mounts for this deploy.
 */
const handler = {
  async fetch(request: Request, env: SiteEnv, ctx: ExecutionContext): Promise<Response> {
    void ctx;

    if (new URL(request.url).pathname === "/healthz") {
      return Response.json({ ok: true, service: "insecur-site" });
    }

    const sentry = sentryBrowserConfig(env);
    const response = await sentryServerEntry.fetch(request, { context: { sentry } });
    return withSecurityHeaders(response);
  },
} satisfies ExportedHandler<SiteEnv>;

export default Sentry.withSentry<SiteEnv>(sentryOptions, handler);
