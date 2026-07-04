import { cloudflareSentryOptions, sentryBrowserConfig } from "@insecur/observability";
import * as Sentry from "@sentry/cloudflare";
import { wrapFetchWithSentry } from "@sentry/tanstackstart-react";
import serverEntry from "@tanstack/react-start/server-entry";
import type { WebEnv } from "./env.js";
import { buildContentSecurityPolicy, generateCspNonce } from "./security/csp.js";

type ServerEntryOptions = Parameters<typeof serverEntry.fetch>[1];

const sentryServerEntry = wrapFetchWithSentry({
  fetch(request, opts) {
    return serverEntry.fetch(request, opts as ServerEntryOptions);
  },
});

function withSecurityHeaders(response: Response, nonce: string, sentryDsn?: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce, { sentryDsn }));
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const handler = {
  async fetch(
    request: Request,
    // Cloudflare passes bindings per request; app code reads them via `cloudflare:workers`.
    env: WebEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    void env;
    void ctx;

    if (new URL(request.url).pathname === "/healthz") {
      return Response.json({ ok: true, service: "insecur-web" });
    }

    const nonce = generateCspNonce();
    const sentry = sentryBrowserConfig(env);
    const response = await sentryServerEntry.fetch(request, { context: { nonce, sentry } });
    return withSecurityHeaders(response, nonce, sentry?.dsn);
  },
} satisfies ExportedHandler<WebEnv>;

export default Sentry.withSentry<WebEnv>(cloudflareSentryOptions, handler);
